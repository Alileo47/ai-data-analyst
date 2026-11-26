import { useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { ChatPanel } from "../src/components/ChatPanel";
import { DataPreview } from "../src/components/DataPreview";
import { UploadPicker } from "../src/components/UploadPicker";
import { AnimatedBackground } from "../src/components/AnimatedBackground";
import { searchDataset } from "../src/api/client";
import { micaBackdrop, tokens } from "../src/theme/tokens";
import type {
  ChatMessage,
  TableSchema,
  UploadDatasetResponse,
} from "../src/types/data";

export default function IndexScreen() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tables, setTables] = useState<TableSchema[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [searchValue, setSearchValue] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const [searchColumns, setSearchColumns] = useState<string[]>([]);
  const [searchRows, setSearchRows] = useState<
    Record<string, string | number | boolean | null>[]
  >([]);
  const [searchEmpty, setSearchEmpty] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const { width } = useWindowDimensions();

  function handleUploaded(response: UploadDatasetResponse) {
    setSessionId(response.session_id);
    setTables(response.tables);
    setMessages([]);
    clearSearch();
  }

  function clearSearch() {
    setSearchValue("");
    setSearchActive(false);
    setSearchColumns([]);
    setSearchRows([]);
    setSearchEmpty(false);
    setSearchError(null);
  }

  function localSearchFallback(query: string) {
    const terms = query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const columns: string[] = [];
    const rows: Record<string, string | number | boolean | null>[] = [];

    tables.forEach((table) => {
      table.preview.forEach((previewRow) => {
        const haystack = table.columns
          .map((column) => String(previewRow[column.name] ?? "").toLowerCase())
          .join(" ");
        if (terms.every((term) => haystack.includes(term))) {
          const row: Record<string, string | number | boolean | null> = {};
          table.columns.forEach((column) => {
            if (!columns.includes(column.name)) {
              columns.push(column.name);
            }
            row[column.name] = previewRow[column.name] ?? null;
          });
          rows.push(row);
        }
      });
    });

    setSearchColumns(columns);
    setSearchRows(rows);
    setSearchEmpty(rows.length === 0);
  }

  async function runSearch() {
    const query = searchValue.trim();
    if (!sessionId || !query || searching) {
      return;
    }

    setSearching(true);
    setSearchActive(true);
    setSearchError(null);
    try {
      const result = await searchDataset({
        session_id: sessionId,
        query,
      });
      setSearchColumns(result.columns);
      setSearchRows(result.rows);
      setSearchEmpty(result.is_empty);
    } catch (error) {
      localSearchFallback(query);
      setSearchError(
        error instanceof Error
          ? `${error.message} Showing locally filtered preview results.`
          : "Search is unavailable; showing locally filtered preview results.",
      );
    } finally {
      setSearching(false);
    }
  }

  return (
    <View style={[styles.root, micaBackdrop()]}>
      <AnimatedBackground />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.page,
          width >= 900 && styles.widePage,
          Platform.OS === "web" && { paddingTop: 72 },
        ]}
      >
        <View style={width >= 900 ? styles.wideLayout : styles.layout}>
          <View style={styles.leftColumn}>
            <View style={styles.introCard}>
              <View style={styles.introRow}>
                <View style={styles.titleBlock}>
                  <Text style={styles.heading}>Analyze a dataset</Text>
                  <Text style={styles.subtitle}>
                    Upload a CSV, Excel workbook, or SQL dump.
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    sessionId ? styles.statusPillReady : styles.statusPillIdle,
                  ]}
                >
                  <View
                    style={[
                      styles.statusDot,
                      sessionId ? styles.statusDotReady : styles.statusDotIdle,
                    ]}
                  />
                  <Text style={styles.statusText}>
                    {sessionId ? "Session ready" : "Awaiting upload"}
                  </Text>
                </View>
              </View>
              <UploadPicker onUploaded={handleUploaded} />
            </View>
            <DataPreview
              tables={tables}
              searchValue={searchValue}
              onSearchValueChange={setSearchValue}
              onSearch={runSearch}
              onClearSearch={clearSearch}
              searching={searching}
              searchColumns={searchColumns}
              searchRows={searchRows}
              searchActive={searchActive}
              searchEmpty={searchEmpty}
              searchError={searchError}
            />
          </View>

          <View style={styles.rightColumn}>
            <ChatPanel
              sessionId={sessionId}
              messages={messages}
              setMessages={setMessages}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  page: {
    flexGrow: 1,
    minHeight: "100%",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "web" ? 52 : 16,
    paddingBottom: 24,
  },
  widePage: {
    paddingHorizontal: 32,
    paddingTop: Platform.OS === "web" ? 52 : 88,
    paddingBottom: 32,
  },
  layout: {
    gap: 20,
    width: "100%",
  },
  wideLayout: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 24,
    marginHorizontal: "auto",
    maxWidth: 1440,
    width: "100%",
  },
  leftColumn: {
    flex: 1,
    gap: 12,
    minWidth: 0,
  },
  rightColumn: {
    flex: 1,
    minWidth: 0,
  },
  introCard: {
    backgroundColor: "rgba(255, 255, 255, 0.40)",
    borderColor: "rgba(120, 129, 149, 0.18)",
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
    padding: 16,
    ...tokens.shadow,
  },
  introRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  titleBlock: {
    flex: 1,
    gap: 3,
  },
  heading: {
    color: tokens.colors.text,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  subtitle: {
    color: tokens.colors.textSecondary,
    lineHeight: 20,
  },
  statusPill: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusPillReady: {
    backgroundColor: tokens.colors.successSoft,
    borderColor: "rgba(148, 207, 188, 0.16)",
  },
  statusPillIdle: {
    backgroundColor: "rgba(245, 248, 252, 0.40)",
    borderColor: "rgba(120, 129, 149, 0.16)",
  },
  statusDot: {
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  statusDotReady: {
    backgroundColor: tokens.colors.success,
  },
  statusDotIdle: {
    backgroundColor: tokens.colors.textMuted,
  },
  statusText: {
    color: tokens.colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
});
