import { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { askQuestion } from "../api/client";
import type { ChatMessage, PreviewRow } from "../types/data";
import { GeneratingIndicator } from "./GeneratingIndicator";
import { acrylicSurface, tokens, type SurfaceStyle } from "../theme/tokens";

const webGlassBlur10: SurfaceStyle =
  Platform.OS === "web"
    ? {
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }
    : {};

interface ChatPanelProps {
  sessionId: string | null;
  messages: ChatMessage[];
  setMessages: (messages: ChatMessage[]) => void;
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "NULL";
  }
  return typeof value === "boolean" ? String(value) : String(value);
}

function ResultTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: PreviewRow[];
}) {
  if (!columns.length) {
    return null;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator
      nestedScrollEnabled
      contentContainerStyle={styles.resultScroll}
    >
      <View>
        <View style={[styles.resultRow, styles.resultHeaderRow]}>
          {columns.map((column) => (
            <Text
              key={column}
              numberOfLines={1}
              style={[styles.resultCell, styles.resultHeaderCell]}
            >
              {column}
            </Text>
          ))}
        </View>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.resultRow}>
            {columns.map((column) => (
              <Text
                key={column}
                numberOfLines={2}
                style={styles.resultCell}
              >
                {displayValue(row[column])}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export function ChatPanel({
  sessionId,
  messages,
  setMessages,
}: ChatPanelProps) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);

  async function submitQuestion() {
    const trimmed = question.trim();
    if (!trimmed || !sessionId || loading) {
      return;
    }

    const userMessage: ChatMessage = {
      id: makeId("user"),
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
    };
    setMessages([...messages, userMessage]);
    setQuestion("");
    setLoading(true);

    try {
      const result = await askQuestion({
        session_id: sessionId,
        question: trimmed,
      });
      const assistantMessage: ChatMessage = {
        id: makeId("assistant"),
        role: "assistant",
        content: result.explanation,
        createdAt: Date.now(),
        sql: result.sql,
        columns: result.columns,
        rows: result.rows,
        isEmpty: result.is_empty,
        truncated: result.truncated,
      };
      setMessages([...messages, userMessage, assistantMessage]);
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: makeId("error"),
        role: "system",
        content:
          error instanceof Error
            ? error.message
            : "The question could not be answered.",
        createdAt: Date.now(),
        error: true,
      };
      setMessages([...messages, userMessage, errorMessage]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}> Simplify your data </Text>
      <ScrollView
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        keyboardShouldPersistTaps="handled"
      >
        {!messages.length && (
          <Text style={styles.placeholder}>
            Upload a dataset, then ask a question in plain English.
          </Text>
        )}
        {messages.map((message) => (
          <View
            key={message.id}
            style={[
              styles.message,
              message.role === "user"
                ? styles.userMessage
                : message.error
                  ? styles.errorMessage
                  : styles.assistantMessage,
            ]}
          >
            {message.role === "user" && (
              <Text style={styles.userLabel}>You</Text>
            )}
            {message.error ? (
              <Text style={styles.errorText}>{message.content}</Text>
            ) : (
              <Text
                style={[
                  styles.messageText,
                  message.role === "assistant" && styles.assistantText,
                ]}
              >
                {message.content}
              </Text>
            )}

            {!!message.sql && (
              <View style={styles.sqlBlock}>
                <Text style={styles.sectionLabel}>Generated SQL</Text>
                <Text selectable style={styles.sqlText}>
                  {message.sql}
                </Text>
              </View>
            )}

            {message.isEmpty ? (
              <Text style={styles.emptyText}>No matching rows returned.</Text>
            ) : (
              !!message.columns?.length && (
                <ResultTable
                  columns={message.columns}
                  rows={message.rows ?? []}
                />
              )
            )}

            {message.truncated && (
              <Text style={styles.truncatedText}>
                Results were limited for display.
              </Text>
            )}
          </View>
        ))}
        {loading && (
          <View style={[styles.message, styles.loadingMessage]}>
            <GeneratingIndicator label="Generating answer..." />
          </View>
        )}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          editable={!!sessionId && !loading}
          multiline
          onChangeText={setQuestion}
          onSubmitEditing={submitQuestion}
          placeholder={
            sessionId ? "Ask a question..." : "Upload a dataset first"
          }
          style={styles.input}
          value={question}
        />
        <Pressable
          accessibilityRole="button"
          disabled={!sessionId || !question.trim() || loading}
          onPress={submitQuestion}
          style={({ pressed }) => [
            styles.sendButton,
            (!sessionId || !question.trim() || loading || pressed) &&
              styles.sendButtonDisabled,
          ]}
        >
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...acrylicSurface({ backgroundColor: "rgba(255, 255, 255, 0.40)", radius: 18 }),
    height: 560,
    maxHeight: 650,
    overflow: "hidden",
    ...tokens.shadow,
  },
  title: {
    borderBottomColor: "rgba(200, 208, 220, 0.42)",
    borderBottomWidth: 1,
    color: tokens.colors.text,
    fontSize: 18,
    fontWeight: "800",
    padding: 12,
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    gap: 10,
    padding: 12,
  },
  placeholder: {
    color: "#64748b",
    textAlign: "center",
  },
  message: {
    borderRadius: 14,
    maxWidth: "92%",
    padding: 10,
  },
  userMessage: {
    alignSelf: "flex-end",
    backgroundColor: "#3569c9",
  },
  assistantMessage: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(248, 251, 255, 0.50)",
    borderColor: "rgba(200, 208, 220, 0.42)",
    borderWidth: 1,
  },
  errorMessage: {
    alignSelf: "flex-start",
    backgroundColor: tokens.colors.errorSoft,
    borderColor: "rgba(180, 35, 24, 0.16)",
    borderWidth: 1,
  },
  loadingMessage: {
    backgroundColor: "rgba(237, 244, 255, 0.40)",
    borderColor: "rgba(37, 99, 235, 0.12)",
    borderWidth: 1,
  },
  userLabel: {
    color: "#dbeafe",
    fontSize: 11,
    fontWeight: "700",
  },
  messageText: {
    color: "#ffffff",
  },
  assistantText: {
    color: "#334155",
  },
  errorText: {
    color: tokens.colors.error,
  },
  sqlBlock: {
    backgroundColor: "#182235",
    borderRadius: 8,
    marginTop: 8,
    padding: 8,
  },
  sectionLabel: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 4,
  },
  sqlText: {
    color: "#e2e8f0",
    fontFamily: "monospace",
  },
  emptyText: {
    color: tokens.colors.textSecondary,
    marginTop: 8,
  },
  truncatedText: {
    color: "#92400e",
    fontSize: 12,
    marginTop: 6,
  },
  resultScroll: {
    marginTop: 8,
  },
  resultRow: {
    flexDirection: "row",
  },
  resultHeaderRow: {
    backgroundColor: "rgba(238, 243, 249, 0.42)",
  },
  resultCell: {
    borderBottomColor: "rgba(200, 208, 220, 0.42)",
    borderBottomWidth: 1,
    borderRightColor: "rgba(200, 208, 220, 0.42)",
    borderRightWidth: 1,
    color: tokens.colors.text,
    minWidth: 120,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  resultHeaderCell: {
    color: tokens.colors.text,
    fontWeight: "800",
  },
  composer: {
    alignItems: "flex-end",
    borderTopColor: "rgba(200, 208, 220, 0.42)",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 10,
  },
  input: {
    ...acrylicSurface({
      backgroundColor: "rgba(255, 255, 255, 0.42)",
      borderColor: "rgba(255, 255, 255, 0.42)",
      radius: tokens.radii.medium,
    }),
    ...webGlassBlur10,
    flex: 1,
    maxHeight: 100,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: tokens.colors.accent,
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14,
  },
  sendButtonDisabled: {
    opacity: 0.55,
  },
  sendText: {
    color: "#ffffff",
    fontWeight: "800",
  },
});
