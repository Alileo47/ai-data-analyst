import { useEffect } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { TableSchema } from "../types/data";
import { GeneratingIndicator } from "./GeneratingIndicator";
import { acrylicSurface, tokens, type SurfaceStyle } from "../theme/tokens";

const webGlassBlur10: SurfaceStyle =
  Platform.OS === "web"
    ? {
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }
    : {};

interface DataPreviewProps {
  tables: TableSchema[];
  searchValue: string;
  onSearchValueChange: (value: string) => void;
  onSearch: () => void;
  onClearSearch: () => void;
  searching: boolean;
  searchColumns: string[];
  searchRows: Record<string, string | number | boolean | null>[];
  searchActive: boolean;
  searchEmpty: boolean;
  searchError: string | null;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "NULL";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

export function DataPreview({
  tables,
  searchValue,
  onSearchValueChange,
  onSearch,
  onClearSearch,
  searching,
  searchColumns,
  searchRows,
  searchActive,
  searchEmpty,
  searchError,
}: DataPreviewProps) {
  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }

    const styleId = "glass-scroll-style";
    let styleElement = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleElement) {
      styleElement = document.createElement("style");
      styleElement.id = styleId;
      styleElement.textContent = `
        .glass-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.42) transparent;
        }
        .glass-scroll::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .glass-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .glass-scroll::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.42);
          border: 1px solid rgba(255, 255, 255, 0.42);
          border-radius: 999px;
        }
      `;
      document.head.appendChild(styleElement);
    }

    return () => {
      styleElement?.remove();
    };
  }, []);

  if (!tables.length) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Data preview</Text>
      <View style={styles.searchRow}>
        <TextInput
          editable={!searching}
          onChangeText={onSearchValueChange}
          onSubmitEditing={onSearch}
          placeholder="Search names, IDs, emails, keywords..."
          style={styles.searchInput}
          value={searchValue}
        />
        <Pressable
          accessibilityRole="button"
          disabled={searching || !searchValue.trim()}
          onPress={onSearch}
          style={({ pressed }) => [
            styles.searchButton,
            (searching || !searchValue.trim() || pressed) &&
              styles.searchButtonDisabled,
          ]}
        >
          {searching ? (
            <GeneratingIndicator label="Searching" />
          ) : (
            <Text style={styles.searchButtonText}>Search</Text>
          )}
        </Pressable>
        {searchActive && (
          <Pressable
            accessibilityRole="button"
            onPress={onClearSearch}
            style={styles.clearButton}
          >
            <Text style={styles.clearButtonText}>Clear</Text>
          </Pressable>
        )}
      </View>
      {!!searchError && (
        <Text style={styles.searchError}>{searchError}</Text>
      )}

      {searchActive && (
        <View style={styles.searchResultsCard}>
          <Text style={styles.searchResultsTitle}>Search results</Text>
          {searchEmpty ? (
            <Text style={styles.emptyText}>No matching records found.</Text>
          ) : (
            <ScrollView
              horizontal
              {...(Platform.OS === "web"
                ? ({ className: "glass-scroll" } as Record<string, string>)
                : {})}
              style={styles.tableWrapper}
              showsHorizontalScrollIndicator
              nestedScrollEnabled
              contentContainerStyle={styles.tableScroll}
            >
              <View>
                <View style={[styles.row, styles.headerRow]}>
                  {searchColumns.map((column) => (
                    <Text
                      key={column}
                      numberOfLines={1}
                      style={[styles.cell, styles.headerCell]}
                    >
                      {column}
                    </Text>
                  ))}
                </View>
                {searchRows.map((row, rowIndex) => (
                  <View key={rowIndex} style={styles.row}>
                    {searchColumns.map((column) => (
                      <Text
                        key={column}
                        numberOfLines={2}
                        style={styles.cell}
                      >
                        {displayValue(row[column])}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      )}

      {tables.map((table) => (
        <View key={table.name} style={styles.tableCard}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableName}>{table.name}</Text>
            <Text
              style={styles.rowCount}
            >
              {table.row_count.toLocaleString()} rows
            </Text>
          </View>

          <Text style={styles.schemaLabel}>Columns</Text>
          <View style={styles.schemaList}>
            {table.columns.map((column) => (
              <Text
                key={column.name}
                style={styles.schemaChip}
              >
                {column.name} ({column.type})
              </Text>
            ))}
          </View>

          {table.preview.length ? (
            <ScrollView
              horizontal
              {...(Platform.OS === "web"
                ? ({ className: "glass-scroll" } as Record<string, string>)
                : {})}
              style={styles.tableWrapper}
              showsHorizontalScrollIndicator
              nestedScrollEnabled
              contentContainerStyle={styles.tableScroll}
            >
              <View>
                <View style={[styles.row, styles.headerRow]}>
                  {table.columns.map((column) => (
                    <Text
                      key={column.name}
                      numberOfLines={1}
                      style={[styles.cell, styles.headerCell]}
                    >
                      {column.name}
                    </Text>
                  ))}
                </View>
                {table.preview.map((row, rowIndex) => (
                  <View key={rowIndex} style={styles.row}>
                    {table.columns.map((column) => (
                      <Text
                        key={column.name}
                        numberOfLines={2}
                        style={styles.cell}
                      >
                        {displayValue(row[column.name])}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : (
            <Text style={styles.emptyText}>No preview rows available.</Text>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  title: {
    color: tokens.colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  tableCard: {
    ...acrylicSurface({ backgroundColor: "rgba(255, 255, 255, 0.40)", radius: 16 }),
    gap: 10,
    padding: 14,
    ...tokens.shadow,
  },
  tableHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  tableName: {
    color: tokens.colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  rowCount: {
    ...acrylicSurface({
      backgroundColor: "rgba(255, 255, 255, 0.42)",
      borderColor: "rgba(255, 255, 255, 0.42)",
      radius: 999,
    }),
    ...webGlassBlur10,
    color: tokens.colors.textSecondary,
    fontSize: 12,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  schemaLabel: {
    color: tokens.colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  schemaList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  schemaChip: {
    ...acrylicSurface({
      backgroundColor: "rgba(255, 255, 255, 0.42)",
      borderColor: "rgba(255, 255, 255, 0.42)",
      radius: 999,
    }),
    ...webGlassBlur10,
    color: tokens.colors.textSecondary,
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  tableScroll: {
    minWidth: "100%",
  },
  tableWrapper: {
    backgroundColor: "rgba(255, 255, 255, 0.42)",
    borderRadius: tokens.radii.small,
    ...webGlassBlur10,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
  },
  headerRow: {
    backgroundColor: "rgba(255, 255, 255, 0.42)",
  },
  cell: {
    borderBottomColor: "rgba(200, 208, 220, 0.42)",
    borderBottomWidth: 1,
    borderRightColor: "rgba(200, 208, 220, 0.42)",
    borderRightWidth: 1,
    color: tokens.colors.text,
    minWidth: 120,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  headerCell: {
    color: tokens.colors.text,
    fontWeight: "800",
  },
  emptyText: {
    color: tokens.colors.textSecondary,
  },
  searchRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  searchInput: {
    ...acrylicSurface({
      backgroundColor: "rgba(255, 255, 255, 0.42)",
      borderColor: "rgba(255, 255, 255, 0.42)",
      radius: tokens.radii.medium,
    }),
    ...webGlassBlur10,
    flexGrow: 1,
    minHeight: 44,
    minWidth: 180,
    paddingHorizontal: 10,
  },
  searchButton: {
    alignItems: "center",
    backgroundColor: tokens.colors.accent,
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 78,
  },
  searchButtonDisabled: {
    opacity: 0.55,
  },
  searchButtonText: {
    color: "#393c3e",
    fontWeight: "800",
  },
  clearButton: {
    minHeight: 44,
    justifyContent: "center",
  },
  clearButtonText: {
    color: tokens.colors.textSecondary,
    fontWeight: "700",
  },
  searchError: {
    color: tokens.colors.error,
  },
  searchResultsCard: {
    ...acrylicSurface({
      backgroundColor: "rgba(237, 248, 244, 0.40)",
      borderColor: "rgba(20, 128, 94, 0.16)",
      radius: 16,
    }),
    gap: 8,
    padding: 12,
  },
  searchResultsTitle: {
    color: tokens.colors.success,
    fontWeight: "800",
  },
});
