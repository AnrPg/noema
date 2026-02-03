// =============================================================================
// CONTENT PRIMITIVE EDITOR
// =============================================================================
// Editor for individual content primitives (text, latex, media, code, etc.)

import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";
import { haptics } from "@/utils/animation";
import type { EditablePrimitive, ContentPrimitiveTypeSimple } from "./types";
import { CONTENT_PRIMITIVE_METADATA } from "./types";

// Local type alias for backward compatibility
type ContentPrimitiveType = ContentPrimitiveTypeSimple;

// =============================================================================
// TYPES
// =============================================================================

export interface ContentPrimitiveEditorProps {
  primitive: EditablePrimitive;
  onUpdate: (primitive: EditablePrimitive) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}

// =============================================================================
// PRIMITIVE TYPE PICKER
// =============================================================================

interface PrimitiveTypePickerProps {
  value: ContentPrimitiveType;
  onChange: (type: ContentPrimitiveType) => void;
  onClose: () => void;
}

function PrimitiveTypePicker({
  value,
  onChange,
  onClose,
}: PrimitiveTypePickerProps) {
  const colors = useColors();

  const categories = {
    text: ["text", "richtext"],
    math: ["latex"],
    media: ["image", "audio", "video"],
    code: ["code", "diagram"],
    special: ["cloze"],
  };

  return (
    <View style={[styles.typePicker, { backgroundColor: colors.surface }]}>
      {Object.entries(categories).map(([category, types]) => (
        <View key={category} style={styles.typeCategory}>
          <Text
            style={[styles.typeCategoryLabel, { color: colors.textSecondary }]}
          >
            {category.charAt(0).toUpperCase() + category.slice(1)}
          </Text>
          <View style={styles.typeOptions}>
            {types.map((type) => {
              const meta =
                CONTENT_PRIMITIVE_METADATA[type as ContentPrimitiveType];
              const isSelected = type === value;
              return (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeOption,
                    {
                      backgroundColor: isSelected
                        ? colors.primary + "20"
                        : colors.surfaceVariant,
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => {
                    haptics.selection();
                    onChange(type as ContentPrimitiveType);
                    onClose();
                  }}
                >
                  <Ionicons
                    name={meta.icon as any}
                    size={16}
                    color={isSelected ? colors.primary : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.typeOptionLabel,
                      { color: isSelected ? colors.primary : colors.text },
                    ]}
                  >
                    {meta.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

// =============================================================================
// TEXT EDITOR
// =============================================================================

interface TextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  multiline?: boolean;
}

function TextEditor({
  content,
  onChange,
  placeholder = "Enter text...",
  multiline = true,
}: TextEditorProps) {
  const colors = useColors();

  return (
    <TextInput
      style={[
        styles.textInput,
        multiline && styles.multilineInput,
        {
          backgroundColor: colors.surfaceVariant,
          color: colors.text,
          borderColor: colors.border,
        },
      ]}
      value={content}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      multiline={multiline}
      textAlignVertical="top"
    />
  );
}

// =============================================================================
// LATEX EDITOR
// =============================================================================

interface LaTeXEditorProps {
  content: string;
  onChange: (content: string) => void;
}

function LaTeXEditor({ content, onChange }: LaTeXEditorProps) {
  const colors = useColors();
  const [showPreview, setShowPreview] = useState(false);

  return (
    <View style={styles.latexEditor}>
      <View style={styles.latexHeader}>
        <View style={styles.latexLabel}>
          <Ionicons name="calculator-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.latexLabelText, { color: colors.textMuted }]}>
            LaTeX
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowPreview(!showPreview)}
          style={styles.previewButton}
        >
          <Ionicons
            name={showPreview ? "eye" : "eye-outline"}
            size={16}
            color={colors.primary}
          />
        </TouchableOpacity>
      </View>
      <TextInput
        style={[
          styles.latexInput,
          {
            backgroundColor: colors.surfaceVariant,
            color: colors.text,
            borderColor: colors.border,
          },
        ]}
        value={content}
        onChangeText={onChange}
        placeholder="\\frac{a}{b} + \\sqrt{c}"
        placeholderTextColor={colors.textMuted}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
      />
      {showPreview && (
        <View
          style={[styles.latexPreview, { backgroundColor: colors.surface }]}
        >
          <Text style={[styles.latexPreviewText, { color: colors.text }]}>
            {content || "LaTeX preview"}
          </Text>
          <Text style={[styles.latexPreviewHint, { color: colors.textMuted }]}>
            (Live preview requires math renderer)
          </Text>
        </View>
      )}
    </View>
  );
}

// =============================================================================
// CODE EDITOR
// =============================================================================

interface CodeEditorProps {
  content: string;
  language?: string;
  onChange: (content: string) => void;
  onLanguageChange: (language: string) => void;
}

const LANGUAGES = [
  "javascript",
  "typescript",
  "python",
  "java",
  "c",
  "cpp",
  "rust",
  "go",
  "sql",
  "html",
  "css",
  "json",
  "shell",
  "other",
];

function CodeEditor({
  content,
  language = "javascript",
  onChange,
  onLanguageChange,
}: CodeEditorProps) {
  const colors = useColors();
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);

  return (
    <View style={styles.codeEditor}>
      <TouchableOpacity
        style={[styles.languageSelector, { borderColor: colors.border }]}
        onPress={() => setShowLanguagePicker(!showLanguagePicker)}
      >
        <Text style={[styles.languageLabel, { color: colors.textSecondary }]}>
          {language}
        </Text>
        <Ionicons
          name="chevron-down"
          size={14}
          color={colors.textMuted}
        />
      </TouchableOpacity>

      {showLanguagePicker && (
        <View
          style={[styles.languagePicker, { backgroundColor: colors.surface }]}
        >
          {LANGUAGES.map((lang) => (
            <TouchableOpacity
              key={lang}
              style={[
                styles.languageOption,
                lang === language && { backgroundColor: colors.primary + "20" },
              ]}
              onPress={() => {
                onLanguageChange(lang);
                setShowLanguagePicker(false);
              }}
            >
              <Text
                style={[
                  styles.languageOptionText,
                  { color: lang === language ? colors.primary : colors.text },
                ]}
              >
                {lang}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <TextInput
        style={[
          styles.codeInput,
          {
            backgroundColor: "#1e1e1e",
            color: "#d4d4d4",
            borderColor: colors.border,
          },
        ]}
        value={content}
        onChangeText={onChange}
        placeholder="// Enter code here..."
        placeholderTextColor="#6a6a6a"
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        textAlignVertical="top"
      />
    </View>
  );
}

// =============================================================================
// IMAGE EDITOR
// =============================================================================

interface ImageEditorProps {
  mediaUrl?: string;
  altText?: string;
  onUrlChange: (url: string) => void;
  onAltTextChange: (altText: string) => void;
}

function ImageEditor({
  mediaUrl,
  altText,
  onUrlChange,
  onAltTextChange,
}: ImageEditorProps) {
  const colors = useColors();

  const handlePickImage = () => {
    // TODO: Implement image picker
    Alert.alert("Image Picker", "Image picker will be implemented");
  };

  return (
    <View style={styles.imageEditor}>
      {mediaUrl ? (
        <View style={styles.imagePreview}>
          <Image
            source={{ uri: mediaUrl }}
            style={styles.previewImage}
            resizeMode="contain"
          />
          <TouchableOpacity
            style={[styles.removeImageButton, { backgroundColor: colors.error }]}
            onPress={() => onUrlChange("")}
          >
            <Ionicons name="close" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[
            styles.imagePlaceholder,
            { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
          ]}
          onPress={handlePickImage}
        >
          <Ionicons name="image-outline" size={32} color={colors.textMuted} />
          <Text style={[styles.imagePlaceholderText, { color: colors.textMuted }]}>
            Tap to add image
          </Text>
        </TouchableOpacity>
      )}

      <TextInput
        style={[
          styles.altTextInput,
          {
            backgroundColor: colors.surfaceVariant,
            color: colors.text,
            borderColor: colors.border,
          },
        ]}
        value={altText}
        onChangeText={onAltTextChange}
        placeholder="Alt text (for accessibility)"
        placeholderTextColor={colors.textMuted}
      />

      <TextInput
        style={[
          styles.urlInput,
          {
            backgroundColor: colors.surfaceVariant,
            color: colors.text,
            borderColor: colors.border,
          },
        ]}
        value={mediaUrl}
        onChangeText={onUrlChange}
        placeholder="Or enter image URL"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
    </View>
  );
}

// =============================================================================
// AUDIO EDITOR
// =============================================================================

interface AudioEditorProps {
  mediaUrl?: string;
  onUrlChange: (url: string) => void;
}

function AudioEditor({ mediaUrl, onUrlChange }: AudioEditorProps) {
  const colors = useColors();

  const handleRecordAudio = () => {
    // TODO: Implement audio recorder
    Alert.alert("Audio Recorder", "Audio recorder will be implemented");
  };

  return (
    <View style={styles.audioEditor}>
      <View style={styles.audioControls}>
        <TouchableOpacity
          style={[styles.recordButton, { backgroundColor: colors.error }]}
          onPress={handleRecordAudio}
        >
          <Ionicons name="mic" size={24} color="#fff" />
        </TouchableOpacity>
        {mediaUrl && (
          <View style={styles.audioInfo}>
            <Ionicons name="musical-note" size={20} color={colors.primary} />
            <Text
              style={[styles.audioFileName, { color: colors.text }]}
              numberOfLines={1}
            >
              Audio attached
            </Text>
          </View>
        )}
      </View>
      <TextInput
        style={[
          styles.urlInput,
          {
            backgroundColor: colors.surfaceVariant,
            color: colors.text,
            borderColor: colors.border,
          },
        ]}
        value={mediaUrl}
        onChangeText={onUrlChange}
        placeholder="Or enter audio URL"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
    </View>
  );
}

// =============================================================================
// CLOZE EDITOR
// =============================================================================

interface ClozeEditorProps {
  content: string;
  onChange: (content: string) => void;
}

function ClozeEditor({ content, onChange }: ClozeEditorProps) {
  const colors = useColors();
  const [clozeCount, setClozeCount] = useState(1);

  const insertCloze = useCallback(() => {
    haptics.light();
    const clozeMarker = `{{c${clozeCount}::}}`;
    onChange(content + clozeMarker);
    setClozeCount(clozeCount + 1);
  }, [content, clozeCount, onChange]);

  return (
    <View style={styles.clozeEditor}>
      <View style={styles.clozeToolbar}>
        <TouchableOpacity
          style={[styles.clozeButton, { backgroundColor: colors.primary }]}
          onPress={insertCloze}
        >
          <Text style={styles.clozeButtonText}>
            Insert Cloze {clozeCount}
          </Text>
        </TouchableOpacity>
        <Text style={[styles.clozeHint, { color: colors.textMuted }]}>
          Use {"{{c1::answer}}"} format
        </Text>
      </View>
      <TextInput
        style={[
          styles.clozeInput,
          {
            backgroundColor: colors.surfaceVariant,
            color: colors.text,
            borderColor: colors.border,
          },
        ]}
        value={content}
        onChangeText={onChange}
        placeholder="The capital of France is {{c1::Paris}}."
        placeholderTextColor={colors.textMuted}
        multiline
        textAlignVertical="top"
      />
    </View>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ContentPrimitiveEditor({
  primitive,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp = true,
  canMoveDown = true,
}: ContentPrimitiveEditorProps) {
  const colors = useColors();
  const [showTypePicker, setShowTypePicker] = useState(false);

  const meta = CONTENT_PRIMITIVE_METADATA[primitive.type];

  const handleTypeChange = useCallback(
    (type: ContentPrimitiveType) => {
      onUpdate({
        ...primitive,
        type,
        content: "", // Reset content when type changes
        mediaUrl: undefined,
        altText: undefined,
        metadata: {},
      });
    },
    [primitive, onUpdate]
  );

  const handleContentChange = useCallback(
    (content: string) => {
      onUpdate({ ...primitive, content });
    },
    [primitive, onUpdate]
  );

  const handleMediaUrlChange = useCallback(
    (mediaUrl: string) => {
      onUpdate({ ...primitive, mediaUrl });
    },
    [primitive, onUpdate]
  );

  const handleAltTextChange = useCallback(
    (altText: string) => {
      onUpdate({ ...primitive, altText });
    },
    [primitive, onUpdate]
  );

  const handleLanguageChange = useCallback(
    (language: string) => {
      onUpdate({
        ...primitive,
        metadata: { ...primitive.metadata, language },
      });
    },
    [primitive, onUpdate]
  );

  const renderEditor = () => {
    switch (primitive.type) {
      case "text":
        return (
          <TextEditor
            content={primitive.content}
            onChange={handleContentChange}
            placeholder="Enter text..."
          />
        );

      case "richtext":
        return (
          <TextEditor
            content={primitive.content}
            onChange={handleContentChange}
            placeholder="Enter rich text (markdown supported)..."
          />
        );

      case "latex":
        return (
          <LaTeXEditor
            content={primitive.content}
            onChange={handleContentChange}
          />
        );

      case "code":
        return (
          <CodeEditor
            content={primitive.content}
            language={primitive.metadata?.language || "javascript"}
            onChange={handleContentChange}
            onLanguageChange={handleLanguageChange}
          />
        );

      case "image":
        return (
          <ImageEditor
            mediaUrl={primitive.mediaUrl}
            altText={primitive.altText}
            onUrlChange={handleMediaUrlChange}
            onAltTextChange={handleAltTextChange}
          />
        );

      case "audio":
        return (
          <AudioEditor
            mediaUrl={primitive.mediaUrl}
            onUrlChange={handleMediaUrlChange}
          />
        );

      case "video":
        return (
          <AudioEditor
            mediaUrl={primitive.mediaUrl}
            onUrlChange={handleMediaUrlChange}
          />
        );

      case "cloze":
        return (
          <ClozeEditor
            content={primitive.content}
            onChange={handleContentChange}
          />
        );

      case "diagram":
        return (
          <TextEditor
            content={primitive.content}
            onChange={handleContentChange}
            placeholder="Diagram definition (Mermaid, etc.)..."
          />
        );

      default:
        return (
          <TextEditor
            content={primitive.content}
            onChange={handleContentChange}
          />
        );
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.typeSelector}
          onPress={() => setShowTypePicker(!showTypePicker)}
        >
          <View
            style={[styles.typeIcon, { backgroundColor: colors.primary + "20" }]}
          >
            <Ionicons
              name={meta.icon as any}
              size={14}
              color={colors.primary}
            />
          </View>
          <Text style={[styles.typeLabel, { color: colors.text }]}>
            {meta.label}
          </Text>
          <Ionicons
            name="chevron-down"
            size={14}
            color={colors.textMuted}
          />
        </TouchableOpacity>

        <View style={styles.actions}>
          {canMoveUp && (
            <TouchableOpacity onPress={onMoveUp} style={styles.actionButton}>
              <Ionicons name="chevron-up" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
          {canMoveDown && (
            <TouchableOpacity onPress={onMoveDown} style={styles.actionButton}>
              <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onDelete} style={styles.actionButton}>
            <Ionicons name="trash-outline" size={16} color={colors.error} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Type Picker */}
      {showTypePicker && (
        <PrimitiveTypePicker
          value={primitive.type}
          onChange={handleTypeChange}
          onClose={() => setShowTypePicker(false)}
        />
      )}

      {/* Editor */}
      <View style={styles.editorContainer}>{renderEditor()}</View>
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 8,
    borderBottomWidth: 1,
  },
  typeSelector: {
    flexDirection: "row",
    alignItems: "center",
  },
  typeIcon: {
    width: 24,
    height: 24,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  typeLabel: {
    fontSize: 13,
    fontWeight: "500",
    marginRight: 4,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  actionButton: {
    padding: 6,
  },
  editorContainer: {
    padding: 12,
  },
  // Type picker
  typePicker: {
    padding: 12,
    borderRadius: 8,
    margin: 8,
  },
  typeCategory: {
    marginBottom: 12,
  },
  typeCategoryLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  typeOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  typeOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  typeOptionLabel: {
    fontSize: 12,
    marginLeft: 4,
  },
  // Text editor
  textInput: {
    borderRadius: 6,
    padding: 10,
    fontSize: 15,
    borderWidth: 1,
  },
  multilineInput: {
    minHeight: 80,
    maxHeight: 200,
  },
  // LaTeX editor
  latexEditor: {},
  latexHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  latexLabel: {
    flexDirection: "row",
    alignItems: "center",
  },
  latexLabelText: {
    fontSize: 12,
    marginLeft: 4,
  },
  previewButton: {
    padding: 4,
  },
  latexInput: {
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    fontFamily: "monospace",
    borderWidth: 1,
    minHeight: 60,
  },
  latexPreview: {
    marginTop: 8,
    padding: 12,
    borderRadius: 6,
    alignItems: "center",
  },
  latexPreviewText: {
    fontSize: 16,
    fontFamily: "monospace",
  },
  latexPreviewHint: {
    fontSize: 11,
    marginTop: 4,
  },
  // Code editor
  codeEditor: {},
  languageSelector: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    marginBottom: 8,
  },
  languageLabel: {
    fontSize: 12,
    marginRight: 4,
  },
  languagePicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    padding: 8,
    borderRadius: 6,
    marginBottom: 8,
  },
  languageOption: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  languageOptionText: {
    fontSize: 12,
  },
  codeInput: {
    borderRadius: 6,
    padding: 12,
    fontSize: 13,
    fontFamily: "monospace",
    borderWidth: 1,
    minHeight: 100,
  },
  // Image editor
  imageEditor: {
    gap: 8,
  },
  imagePreview: {
    position: "relative",
  },
  previewImage: {
    width: "100%",
    height: 150,
    borderRadius: 6,
  },
  removeImageButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  imagePlaceholder: {
    height: 120,
    borderRadius: 6,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  imagePlaceholderText: {
    fontSize: 13,
    marginTop: 8,
  },
  altTextInput: {
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    borderWidth: 1,
  },
  urlInput: {
    borderRadius: 6,
    padding: 10,
    fontSize: 13,
    borderWidth: 1,
  },
  // Audio editor
  audioEditor: {
    gap: 8,
  },
  audioControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  recordButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  audioInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  audioFileName: {
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  // Cloze editor
  clozeEditor: {},
  clozeToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  clozeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  clozeButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  clozeHint: {
    fontSize: 11,
  },
  clozeInput: {
    borderRadius: 6,
    padding: 12,
    fontSize: 15,
    borderWidth: 1,
    minHeight: 80,
  },
});
