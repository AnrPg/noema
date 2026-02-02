/**
 * Multi-Belonging Components
 *
 * A suite of components for managing cards that participate in multiple
 * categories/domains simultaneously. These components support:
 *
 * - Participation management (card ↔ category relationships)
 * - Synthesis prompt display and response capture
 * - Bridge card creation and visualization
 *
 * The multi-belonging system allows learning artifacts to exist once
 * canonically while participating in many contexts with context-specific
 * behavior and analytics.
 */

// Participation management
export {
  ParticipationPanel,
  type ParticipationPanelProps,
} from "./ParticipationPanel";

// Synthesis prompts
export {
  SynthesisPromptUI,
  type SynthesisPromptUIProps,
  type SynthesisPromptDisplayProps,
} from "./SynthesisPromptUI";

// Bridge card components
export { BridgeCardViewer } from "./BridgeCardViewer";
export { BridgeCardCreator } from "./BridgeCardCreator";
