// =============================================================================
// @manthanein/shared - Main Entry Point
// =============================================================================
// Central export point for all shared types, algorithms, and utilities
// Used by both the API and mobile app packages
//
// Named after "Manthanein" (μανθάνειν) - Greek for "to learn"
// The root of words like "mathematics" and "polymath"

// =============================================================================
// TYPES
// =============================================================================
// All TypeScript interfaces and type definitions

export * from "./types";

// =============================================================================
// ALGORITHMS
// =============================================================================
// Spaced repetition scheduling algorithms (FSRS, HLR, etc.)

export * from "./algorithms";

// =============================================================================
// PLUGINS
// =============================================================================
// Plugin system for extensibility

export * from "./plugins";

// =============================================================================
// GAMIFICATION
// =============================================================================
// XP, achievements, streaks, skill trees, and meta-learning

export * from "./gamification";

// =============================================================================
// SETTINGS
// =============================================================================
// Professional-grade settings system with hierarchical scopes, history,
// LKGC (Last Known Good Configuration), and plugin extensibility

export * from "./settings";

// =============================================================================
// LKGC - LOCAL KNOWLEDGE GRAPH CORE
// =============================================================================
// Event ingestion, aggregation, and feature derivation pipeline.
// NOTE: "LKGC" here means "Local Knowledge Graph Core", not "Last Known Good
// Configuration" (which is in the settings module).
//
// This is the ONLY entry point for learning and interaction signals.
// Everything else (features, mastery, decisions, AI snapshots) derives from here.

export * from "./lkgc";

// =============================================================================
// DATA IMPORT
// =============================================================================
// Comprehensive data import system for heterogeneous formats.
// Handles Excel, CSV, JSON, Markdown flashcard files, and more.
// Provides schema inference, interactive mapping, and card generation.

export * as DataImport from "./import";
