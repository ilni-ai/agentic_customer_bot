// src/components/ChatInterface.jsx
import { useState, useRef, useEffect } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import {
  Container,
  Form,
  Button,
  Card,
  Spinner,
  Row,
  Col,
  ListGroup,
} from "react-bootstrap";
import { ChatLeftDots, PersonCircle } from "react-bootstrap-icons";

const ChatInterface = () => {
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [history]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    const userMessage = { sender: "user", content: query };
    setHistory((prev) => [...prev, userMessage]);

    try {
      const res = await axios.post("http://localhost:5000/api/query", { query });
      const { facts, response, followUpSuggestions = [] } = res.data;

      const botMessage = {
        sender: "bot",
        content: response,
        facts,
        originalQuery: query,
        followUpSuggestions,
      };
      setHistory((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error("Error:", error);
      setHistory((prev) => [...prev, { sender: "bot", content: "Error fetching response." }]);
    } finally {
      setQuery("");
      setLoading(false);
    }
  };

  const handleFollowUp = async (followUpQuery) => {
    setLoading(true);
    try {
      const res = await axios.post("http://localhost:5000/api/followup", { followUpQuery });
      const botMessage = {
        sender: "bot",
        content: res.data.followUpResponse,
      };
      setHistory((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error("Follow-up error:", error);
      setHistory((prev) => [...prev, { sender: "bot", content: "Error fetching follow-up." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="py-4" style={{ maxWidth: "800px" }}>
      <Card className="shadow-sm">
        <Card.Header className="d-flex align-items-center gap-2">
          <ChatLeftDots size={24} /> <strong>Agentic RAG Customer Bot</strong>
        </Card.Header>
        <Card.Body style={{ minHeight: "400px" }}>
          <div className="mb-4" style={{ maxHeight: "55vh", overflowY: "auto" }}>
            {history.map((msg, index) => (
              <div key={index} className="mb-3">
                {msg.sender === "user" ? (
                  <p>
                    <PersonCircle /> <strong>User:</strong> {msg.content}
                  </p>
                ) : (
                  <>
                    {msg.facts && (
                      <>
                        <strong>Top Retrieved Facts</strong>
                        <ul>
                          {msg.facts.map((fact, i) => (
                            <li key={i}>{fact}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    <strong>AI Response:</strong>
                    <Card className="p-2 mt-2 bg-light">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </Card>
                    {msg.followUpSuggestions?.length > 0 && (
                      <div className="mt-2">
                        <strong>Suggested Follow-Ups:</strong>
                        <ListGroup className="mt-1">
                          {msg.followUpSuggestions.map((s, i) => (
                            <ListGroup.Item
                              key={i}
                              action
                              variant="secondary"
                              onClick={() => handleFollowUp(s)}
                            >
                              {s}
                            </ListGroup.Item>
                          ))}
                        </ListGroup>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <Form onSubmit={handleSubmit} className="pt-3">
            <Row className="g-2 align-items-center">
              <Col xs={9} sm={10}>
                <Form.Control
                  type="text"
                  placeholder="Ask a customer support question..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={loading}
                />
              </Col>
              <Col xs={3} sm={2}>
                <Button
                  variant="primary"
                  type="submit"
                  className="w-100"
                  disabled={loading}
                >
                  {loading ? <Spinner animation="border" size="sm" /> : "Ask"}
                </Button>
              </Col>
            </Row>
          </Form>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default ChatInterface;
