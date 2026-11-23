import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";

import { uploadDataset } from "../api/client";
import type { UploadDatasetResponse } from "../types/data";
import { GeneratingIndicator } from "./GeneratingIndicator";
import { acrylicSurface, tokens } from "../theme/tokens";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

interface UploadPickerProps {
  onUploaded: (response: UploadDatasetResponse) => void;
  disabled?: boolean;
}

export function UploadPicker({
  onUploaded,
  disabled = false,
}: UploadPickerProps) {
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);

  async function pickAndUpload() {
    if (uploading || disabled) {
      return;
    }

    setStatus("");
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "text/csv",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/sql",
        "text/plain",
      ],
      copyToCacheDirectory: true,
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets?.[0];
    if (!asset) {
      setStatus("No file was selected.");
      return;
    }
    const lowerName = asset.name.toLowerCase();
    if (
      !lowerName.endsWith(".csv") &&
      !lowerName.endsWith(".xlsx") &&
      !lowerName.endsWith(".sql")
    ) {
      setStatus("Please choose a CSV, XLSX, or SQL file.");
      return;
    }

    if (typeof asset.size === "number" && asset.size > MAX_UPLOAD_BYTES) {
      setStatus("The file exceeds the 20 MB upload limit.");
      return;
    }

    setUploading(true);
    setStatus(`Uploading ${asset.name}...`);
    try {
      const response = await uploadDataset({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType,
      });
      setStatus(`${asset.name} uploaded successfully.`);
      onUploaded(response);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "The file could not be uploaded.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        disabled={uploading || disabled}
        onPress={pickAndUpload}
        style={({ pressed }) => [
          styles.button,
          (uploading || disabled || pressed) && styles.buttonDisabled,
        ]}
      >
        <View style={styles.buttonContent}>
          <View style={styles.iconTile}>
            <Text style={styles.iconText}>+</Text>
          </View>
          {uploading ? (
            <GeneratingIndicator label="Uploading file..." />
          ) : (
            <View>
              <Text style={styles.buttonText}>Choose a file</Text>
              <Text style={styles.buttonMeta}>CSV, XLSX, or SQL · 20 MB max</Text>
            </View>
          )}
        </View>
      </Pressable>
      {!!status && (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            styles.status,
            uploading && styles.uploadingStatus,
            status.includes("successfully") && styles.successStatus,
          ]}
        >
          {status}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  button: {
    ...acrylicSurface({
      backgroundColor: "rgba(237, 244, 255, 0.42)",
      borderColor: "rgba(37, 99, 235, 0.20)",
      radius: 14,
    }),
    alignItems: "center",
    minHeight: 68,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  buttonDisabled: {
    opacity: 0.72,
  },
  buttonContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 11,
  },
  iconTile: {
    alignItems: "center",
    backgroundColor: tokens.colors.accent,
    borderRadius: 10,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  iconText: {
    color: "#070a09",
    fontSize: 22,
    lineHeight: 35,
  },
  buttonText: {
    color: tokens.colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  buttonMeta: {
    color: tokens.colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  status: {
    color: tokens.colors.error,
    fontSize: 13,
  },
  uploadingStatus: {
    color: tokens.colors.textSecondary,
  },
  successStatus: {
    color: tokens.colors.success,
  },
});
