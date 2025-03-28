// agenticCustomerBot
// This is the main server file for the Agentic CustomerBot.
// It sets up an Express server, handles API requests, and integrates
//  with the Google Gemini API for generating responses and embeddings.
//
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { cosineSimilarity } from "./utils/cosineSimilarity.js";
import { TextLoader } from "langchain/document_loaders/fs/text";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware for parsing and CORS
app.use(bodyParser.json());
app.use(cors());

// Initialize Google Gemini API clients
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = new ChatGoogleGenerativeAI({
  model: "models/gemini-2.0-flash",
  maxOutputTokens: 2048,
});

// Generate embeddings using Gemini API
const generateEmbedding = async (text) => {
  try {
    const embeddingModel = genAI.getGenerativeModel({ model: "embedding-001" });
    const { embedding } = await embeddingModel.embedContent({
      content: { parts: [{ text }] },
    });
    return embedding?.values;
  } catch (err) {
    console.error("Embedding error:", err.message);
    return null;
  }
};

// Load FAQ data from ./data/faq.txt
const loadSupportDocs = async () => {
  try {
    const loader = new TextLoader("./data/faq.txt");
    return await loader.load();
  } catch (err) {
    console.error("Error loading FAQ file:", err);
    return [];
  }
};

// Semantic retrieval using cosine similarity over embedded FAQ sentences
const retrieveData = async (query, documents, topK = 3, minSimThreshold = 0.6) => {
  const queryEmbedding = await generateEmbedding(query);
  if (!queryEmbedding) throw new Error("Failed to generate query embedding.");

  const allSentences = documents.flatMap(doc =>
    doc.pageContent.split(/\r?\n+/).map(s => s.trim()).filter(Boolean)
  );

  const ranked = await Promise.all(
    allSentences.map(async (sentence) => {
      const emb = await generateEmbedding(sentence);
      return emb ? { sentence, similarity: cosineSimilarity(queryEmbedding, emb) } : null;
    })
  );

  return ranked
    .filter(Boolean)
    .filter(({ similarity }) => similarity >= minSimThreshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
    .map(({ sentence }) => sentence);
};

// Generate natural follow-up questions using Gemini model
const generateFollowUpSuggestions = async (aiResponse) => {
  try {
    const followUpPrompt = `
Given the following customer support response, suggest 2 helpful follow-up questions or next steps the user might ask. Only return the list:
"""${aiResponse}"""
`;
    const genModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await genModel.generateContent(followUpPrompt);
    const text = result.response.text();

    return text
      .split("\n")
      .map(l => l.replace(/^[-*\d.]+\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 2);
  } catch (err) {
    console.error("Failed to generate follow-up suggestions:", err.message);
    return [];
  }
};

// Main query endpoint with retrieval + generation + follow-up suggestions
app.post("/api/query", async (req, res) => {
  const { query } = req.body;

  try {
    const docs = await loadSupportDocs();
    const facts = await retrieveData(query, docs, 3);
    const augmented = `${query}\n\nSupport Info:\n${facts.join("\n")}`;

    const response = await model.invoke([["human", augmented]]);
    const aiText = response.content;
    const followUpSuggestions = await generateFollowUpSuggestions(aiText);

    res.json({ query, facts, response: aiText, followUpSuggestions });
  } catch (err) {
    console.error("Main query error:", err.message);
    res.status(500).json({ error: "Failed to handle query." });
  }
});

// Follow-up query endpoint (reuses the same flow)
app.post("/api/followup", async (req, res) => {
  const { followUpQuery } = req.body;

  try {
    const docs = await loadSupportDocs();
    const facts = await retrieveData(followUpQuery, docs, 3);
    const augmented = `${followUpQuery}\n\nSupport Context:\n${facts.join("\n")}`;

    const response = await model.invoke([["human", augmented]]);
    res.json({ followUpQuery, facts, followUpResponse: response.content });
  } catch (err) {
    console.error("Follow-up error:", err.message);
    res.status(500).json({ error: "Failed to handle follow-up." });
  }
});

// Start server
app.listen(port, () => {
  console.log(`\u2705 Agentic CustomerBot running at http://localhost:${port}`);
});
