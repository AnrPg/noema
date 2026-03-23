/**
 * Card Creator Wizard — /cards/new
 *
 * Multi-step wizard for creating a single card or a batch of cards.
 *
 * Step 1 — Card Type Selection (Standard 22 + Remediation 20)
 * Step 2 — Content Entry (structured form for simple types, raw JSON textarea for complex)
 * Step 3 — Card Settings (tags, nodes, difficulty, state, batch mode)
 * Step 4 — Result (success, links to created card(s))
 *
 * ADR-007 D6: Phase 10 will replace complex-type JSON textarea with rich editors.
 */

'use client';

import type {
  IBatchCreateInput,
  ICardDto,
  ICreateCardInput,
  ICreateNodeInput,
  IGraphNodeDto,
  NodeType,
} from '@noema/api-client';
import {
  contentKeys,
  useBatchCreateCards,
  useCreateCard,
  useCreatePKGNode,
  usePKGNodes,
} from '@noema/api-client';
import { useAuth } from '@noema/auth';
import type { UserId } from '@noema/types';
import { CardType, RemediationCardType } from '@noema/types';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, Plus } from 'lucide-react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import * as React from 'react';

// ============================================================================
// Types
// ============================================================================

type WizardStep = 1 | 2 | 3 | 4;

type AllCardType = string;

interface ICardTypeInfo {
  value: AllCardType;
  label: string;
  description: string;
  group: 'Standard' | 'Remediation';
}

interface IContentFormData {
  // ATOMIC
  atomicFront: string;
  atomicBack: string;
  atomicHint: string;
  // DEFINITION
  defTerm: string;
  defDefinition: string;
  defPartOfSpeech: string;
  defExamples: string;
  // TRUE_FALSE
  tfStatement: string;
  tfIsTrue: boolean;
  tfExplanation: string;
  // MULTIPLE_CHOICE
  mcQuestion: string;
  mcChoices: string;
  mcExplanation: string;
  // Complex types (raw JSON)
  rawJson: string;
}

interface ISettingsFormData {
  tags: string;
  knowledgeNodeIds: string;
  difficulty: string;
  state: 'ACTIVE' | 'DRAFT';
  batchMode: boolean;
  batchJson: string;
}

type CreatedResult =
  | { mode: 'single'; card: ICardDto }
  | { mode: 'batch'; batchId: string; created: ICardDto[]; total: number; failed: number };

interface INodeTypeOption {
  value: NodeType;
  label: string;
  description: string;
}

// ============================================================================
// Card Type Registry
// ============================================================================

const CARD_TYPE_INFO: ICardTypeInfo[] = [
  // Standard Types
  {
    value: CardType.ATOMIC,
    label: 'Atomic',
    description: 'Simple question / answer pair',
    group: 'Standard',
  },
  {
    value: CardType.CLOZE,
    label: 'Cloze',
    description: 'Fill-in-the-blank card',
    group: 'Standard',
  },
  {
    value: CardType.IMAGE_OCCLUSION,
    label: 'Image Occlusion',
    description: 'Image with masked regions',
    group: 'Standard',
  },
  { value: CardType.AUDIO, label: 'Audio', description: 'Listen and recall', group: 'Standard' },
  {
    value: CardType.PROCESS,
    label: 'Process',
    description: 'Step-by-step sequences',
    group: 'Standard',
  },
  {
    value: CardType.COMPARISON,
    label: 'Comparison',
    description: 'Compare A vs B vs C',
    group: 'Standard',
  },
  {
    value: CardType.EXCEPTION,
    label: 'Exception',
    description: 'Boundary conditions / exceptions',
    group: 'Standard',
  },
  {
    value: CardType.ERROR_SPOTTING,
    label: 'Error Spotting',
    description: 'Find the mistake',
    group: 'Standard',
  },
  {
    value: CardType.CONFIDENCE_RATED,
    label: 'Confidence Rated',
    description: 'Metacognition training',
    group: 'Standard',
  },
  {
    value: CardType.CONCEPT_GRAPH,
    label: 'Concept Graph',
    description: 'Relation mapping',
    group: 'Standard',
  },
  {
    value: CardType.CASE_BASED,
    label: 'Case-Based',
    description: 'Vignette → decision',
    group: 'Standard',
  },
  {
    value: CardType.MULTIMODAL,
    label: 'Multimodal',
    description: 'Text + image + audio',
    group: 'Standard',
  },
  { value: CardType.TRANSFER, label: 'Transfer', description: 'Novel contexts', group: 'Standard' },
  {
    value: CardType.PROGRESSIVE_DISCLOSURE,
    label: 'Progressive Disclosure',
    description: 'Layered complexity',
    group: 'Standard',
  },
  {
    value: CardType.MULTIPLE_CHOICE,
    label: 'Multiple Choice',
    description: 'Multiple choice question',
    group: 'Standard',
  },
  {
    value: CardType.TRUE_FALSE,
    label: 'True / False',
    description: 'True or false statement',
    group: 'Standard',
  },
  {
    value: CardType.MATCHING,
    label: 'Matching',
    description: 'Match item pairs',
    group: 'Standard',
  },
  {
    value: CardType.ORDERING,
    label: 'Ordering',
    description: 'Order items by criterion',
    group: 'Standard',
  },
  {
    value: CardType.DEFINITION,
    label: 'Definition',
    description: 'Definition recall',
    group: 'Standard',
  },
  {
    value: CardType.CAUSE_EFFECT,
    label: 'Cause & Effect',
    description: 'Cause-effect relationships',
    group: 'Standard',
  },
  {
    value: CardType.TIMELINE,
    label: 'Timeline',
    description: 'Timeline ordering',
    group: 'Standard',
  },
  { value: CardType.DIAGRAM, label: 'Diagram', description: 'Diagram labeling', group: 'Standard' },
  // Remediation Types
  {
    value: RemediationCardType.CONTRASTIVE_PAIR,
    label: 'Contrastive Pair',
    description: 'Compare similar items side by side',
    group: 'Remediation',
  },
  {
    value: RemediationCardType.MINIMAL_PAIR,
    label: 'Minimal Pair',
    description: 'Minimal difference comparison',
    group: 'Remediation',
  },
  {
    value: RemediationCardType.FALSE_FRIEND,
    label: 'False Friend',
    description: 'Address linguistic false friends',
    group: 'Remediation',
  },
  {
    value: RemediationCardType.OLD_VS_NEW_DEFINITION,
    label: 'Old vs New Definition',
    description: 'Old vs new definition contrast',
    group: 'Remediation',
  },
  {
    value: RemediationCardType.BOUNDARY_CASE,
    label: 'Boundary Case',
    description: 'Edge case exploration',
    group: 'Remediation',
  },
  {
    value: RemediationCardType.RULE_SCOPE,
    label: 'Rule Scope',
    description: 'When rules apply / do not apply',
    group: 'Remediation',
  },
  {
    value: RemediationCardType.DISCRIMINANT_FEATURE,
    label: 'Discriminant Feature',
    description: 'Key distinguishing features',
    group: 'Remediation',
  },
  {
    value: RemediationCardType.ASSUMPTION_CHECK,
    label: 'Assumption Check',
    description: 'Surface hidden assumptions',
    group: 'Remediation',
  },
  {
    value: RemediationCardType.COUNTEREXAMPLE,
    label: 'Counterexample',
    description: 'Disprove overgeneralization',
    group: 'Remediation',
  },
  {
    value: RemediationCardType.REPRESENTATION_SWITCH,
    label: 'Representation Switch',
    description: 'Switch between representations',
    group: 'Remediation',
  },
  {
    value: RemediationCardType.RETRIEVAL_CUE,
    label: 'Retrieval Cue',
    description: 'Improve retrieval cues',
    group: 'Remediation',
  },
  {
    value: RemediationCardType.ENCODING_REPAIR,
    label: 'Encoding Repair',
    description: 'Fix encoding issues',
    group: 'Remediation',
  },
  {
    value: RemediationCardType.OVERWRITE_DRILL,
    label: 'Overwrite Drill',
    description: 'Override incorrect memory',
    group: 'Remediation',
  },
  {
    value: RemediationCardType.AVAILABILITY_BIAS_DISCONFIRMATION,
    label: 'Availability Bias Disconfirmation',
    description: 'Counter availability bias',
    group: 'Remediation',
  },
  {
    value: RemediationCardType.SELF_CHECK_RITUAL,
    label: 'Self-Check Ritual',
    description: 'Teach self-check rituals',
    group: 'Remediation',
  },
  {
    value: RemediationCardType.CALIBRATION_TRAINING,
    label: 'Calibration Training',
    description: 'Calibration practice',
    group: 'Remediation',
  },
  {
    value: RemediationCardType.ATTRIBUTION_REFRAMING,
    label: 'Attribution Reframing',
    description: 'Reframe attributions',
    group: 'Remediation',
  },
  {
    value: RemediationCardType.STRATEGY_REMINDER,
    label: 'Strategy Reminder',
    description: 'Encode learning strategies',
    group: 'Remediation',
  },
  {
    value: RemediationCardType.CONFUSABLE_SET_DRILL,
    label: 'Confusable Set Drill',
    description: 'Drill confusable items',
    group: 'Remediation',
  },
  {
    value: RemediationCardType.PARTIAL_KNOWLEDGE_DECOMPOSITION,
    label: 'Partial Knowledge Decomposition',
    description: 'Break down partial knowledge',
    group: 'Remediation',
  },
];

const NODE_TYPE_OPTIONS: INodeTypeOption[] = [
  { value: 'concept', label: 'Concept', description: 'General topic or idea' },
  { value: 'skill', label: 'Skill', description: 'Something the learner can do' },
  { value: 'fact', label: 'Fact', description: 'Specific information to recall' },
  { value: 'procedure', label: 'Procedure', description: 'Step-by-step method' },
  { value: 'principle', label: 'Principle', description: 'Rule or governing idea' },
  { value: 'example', label: 'Example', description: 'Concrete instance or case' },
];

// ============================================================================
// Simple-type set (structured form)
// ============================================================================

const SIMPLE_TYPES = new Set<string>([
  CardType.ATOMIC,
  CardType.DEFINITION,
  CardType.TRUE_FALSE,
  CardType.MULTIPLE_CHOICE,
]);

// ============================================================================
// JSON placeholder examples for complex types
// ============================================================================

const COMPLEX_PLACEHOLDERS: Record<string, string> = {
  [CardType.CLOZE]: JSON.stringify(
    {
      template: 'The capital of France is {{c1::Paris}}.',
      clozes: [{ text: 'Paris', answer: 'Paris', position: 0 }],
    },
    null,
    2
  ),
  [CardType.IMAGE_OCCLUSION]: JSON.stringify(
    {
      imageUrl: 'https://...',
      regions: [{ id: '1', x: 10, y: 20, width: 100, height: 50, label: 'Label' }],
    },
    null,
    2
  ),
  [CardType.MATCHING]: JSON.stringify(
    {
      pairs: [
        { left: 'A', right: '1' },
        { left: 'B', right: '2' },
      ],
    },
    null,
    2
  ),
  [CardType.ORDERING]: JSON.stringify(
    {
      items: [
        { text: 'Step A', correctPosition: 0 },
        { text: 'Step B', correctPosition: 1 },
      ],
      orderingCriterion: 'chronological',
    },
    null,
    2
  ),
  [CardType.CONCEPT_GRAPH]: JSON.stringify(
    {
      targetConcept: 'Photosynthesis',
      nodes: [{ id: 'n1', label: 'Light' }],
      edges: [{ from: 'n1', to: 'n2', label: 'enables' }],
    },
    null,
    2
  ),
};

function getComplexPlaceholder(cardType: string): string {
  return (
    COMPLEX_PLACEHOLDERS[cardType] ??
    JSON.stringify(
      { front: 'Question or prompt', back: 'Answer or response', hint: 'Optional hint' },
      null,
      2
    )
  );
}

// ============================================================================
// Content builder — converts form data to API content object
// ============================================================================

function buildContent(cardType: string, form: IContentFormData): Record<string, unknown> {
  if (cardType === CardType.ATOMIC) {
    const content: Record<string, unknown> = {
      front: form.atomicFront,
      back: form.atomicBack,
    };
    if (form.atomicHint.trim() !== '') content['hint'] = form.atomicHint;
    return content;
  }

  if (cardType === CardType.DEFINITION) {
    const examples = form.defExamples
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s !== '');
    const content: Record<string, unknown> = {
      term: form.defTerm,
      definition: form.defDefinition,
    };
    if (form.defPartOfSpeech.trim() !== '') content['partOfSpeech'] = form.defPartOfSpeech;
    if (examples.length > 0) content['examples'] = examples;
    return content;
  }

  if (cardType === CardType.TRUE_FALSE) {
    const content: Record<string, unknown> = {
      statement: form.tfStatement,
      isTrue: form.tfIsTrue,
    };
    if (form.tfExplanation.trim() !== '') content['explanation'] = form.tfExplanation;
    return content;
  }

  if (cardType === CardType.MULTIPLE_CHOICE) {
    const choices = form.mcChoices
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s !== '')
      .map((s) => {
        const correct = s.startsWith('*');
        return { text: correct ? s.slice(1).trim() : s, correct };
      });
    const content: Record<string, unknown> = {
      front: form.mcQuestion,
      choices,
    };
    if (form.mcExplanation.trim() !== '') content['explanation'] = form.mcExplanation;
    return content;
  }

  // Fallback: raw JSON already parsed by caller
  return {};
}

// ============================================================================
// Helpers
// ============================================================================

function parseCommaSeparated(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

const KNOWLEDGE_NODE_ID_PATTERN = /^node_[a-zA-Z0-9]{21}$/;

function normalizeKnowledgeNodeIds(raw: string): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of parseCommaSeparated(raw)) {
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

function ensureNodeList(value: unknown): IGraphNodeDto[] {
  return Array.isArray(value) ? (value as IGraphNodeDto[]) : [];
}

function validateKnowledgeNodeIds(ids: string[]): string | null {
  if (ids.length > 50) {
    return 'You can link up to 50 knowledge nodes per card.';
  }

  const invalid = ids.find((id) => !KNOWLEDGE_NODE_ID_PATTERN.test(id));
  if (invalid !== undefined) {
    return [
      'Invalid knowledge node ID: ',
      invalid,
      '. Expected format is node_ followed by 21 alphanumeric characters.',
    ].join('');
  }

  return null;
}

function parseDifficulty(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = parseFloat(raw);
  if (isNaN(n)) return undefined;
  return Math.min(1, Math.max(0, n));
}

function labelForType(value: string): string {
  return CARD_TYPE_INFO.find((t) => t.value === value)?.label ?? value;
}

// ============================================================================
// Step 1 — Type Selection
// ============================================================================

interface IStep1Props {
  onSelect: (cardType: string) => void;
}

function Step1TypeSelection({ onSelect }: IStep1Props): React.JSX.Element {
  const standardTypes = CARD_TYPE_INFO.filter((t) => t.group === 'Standard');
  const remediationTypes = CARD_TYPE_INFO.filter((t) => t.group === 'Remediation');

  return (
    <div className="flex flex-col gap-8">
      <TypeGroup label="Standard Types (22)" types={standardTypes} onSelect={onSelect} />
      <TypeGroup label="Remediation Types (20)" types={remediationTypes} onSelect={onSelect} />
    </div>
  );
}

interface ITypeGroupProps {
  label: string;
  types: ICardTypeInfo[];
  onSelect: (cardType: string) => void;
}

function TypeGroup({ label, types, onSelect }: ITypeGroupProps): React.JSX.Element {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {types.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => {
              onSelect(t.value);
            }}
            className={[
              'flex flex-col gap-1 rounded-lg border border-border p-3 text-left',
              'transition-colors hover:border-primary/60 hover:bg-primary/5',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            ].join(' ')}
          >
            <span className="text-sm font-medium leading-tight">{t.label}</span>
            <span className="text-xs text-muted-foreground leading-snug">{t.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Step 2 — Content Entry
// ============================================================================

interface IStep2Props {
  cardType: string;
  form: IContentFormData;
  onChange: (patch: Partial<IContentFormData>) => void;
  jsonError: string | null;
  onBack: () => void;
  onNext: () => void;
}

function Step2ContentEntry({
  cardType,
  form,
  onChange,
  jsonError,
  onBack,
  onNext,
}: IStep2Props): React.JSX.Element {
  const isSimple = SIMPLE_TYPES.has(cardType);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-md border border-border bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
        Card type: <span className="font-semibold text-foreground">{labelForType(cardType)}</span>
      </div>

      {cardType === CardType.ATOMIC && <AtomicForm form={form} onChange={onChange} />}

      {cardType === CardType.DEFINITION && <DefinitionForm form={form} onChange={onChange} />}

      {cardType === CardType.TRUE_FALSE && <TrueFalseForm form={form} onChange={onChange} />}

      {cardType === CardType.MULTIPLE_CHOICE && (
        <MultipleChoiceForm form={form} onChange={onChange} />
      )}

      {!isSimple && (
        <ComplexJsonForm
          cardType={cardType}
          value={form.rawJson}
          error={jsonError}
          onChange={(v) => {
            onChange({ rawJson: v });
          }}
        />
      )}

      <StepNavFooter onBack={onBack} onNext={onNext} nextLabel="Next: Settings" />
    </div>
  );
}

// ---- Structured forms ----

interface IFormProps {
  form: IContentFormData;
  onChange: (patch: Partial<IContentFormData>) => void;
}

function AtomicForm({ form, onChange }: IFormProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <FieldGroup label="Front (question / prompt)" required>
        <textarea
          value={form.atomicFront}
          onChange={(e) => {
            onChange({ atomicFront: e.target.value });
          }}
          rows={3}
          placeholder="Enter the question or prompt..."
          className={textareaClass}
        />
      </FieldGroup>
      <FieldGroup label="Back (answer)" required>
        <textarea
          value={form.atomicBack}
          onChange={(e) => {
            onChange({ atomicBack: e.target.value });
          }}
          rows={3}
          placeholder="Enter the answer..."
          className={textareaClass}
        />
      </FieldGroup>
      <FieldGroup label="Hint (optional)">
        <input
          type="text"
          value={form.atomicHint}
          onChange={(e) => {
            onChange({ atomicHint: e.target.value });
          }}
          placeholder="Optional hint..."
          className={inputClass}
        />
      </FieldGroup>
    </div>
  );
}

function DefinitionForm({ form, onChange }: IFormProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <FieldGroup label="Term" required>
        <input
          type="text"
          value={form.defTerm}
          onChange={(e) => {
            onChange({ defTerm: e.target.value });
          }}
          placeholder="Enter the term..."
          className={inputClass}
        />
      </FieldGroup>
      <FieldGroup label="Definition" required>
        <textarea
          value={form.defDefinition}
          onChange={(e) => {
            onChange({ defDefinition: e.target.value });
          }}
          rows={3}
          placeholder="Enter the definition..."
          className={textareaClass}
        />
      </FieldGroup>
      <FieldGroup label="Part of speech (optional)">
        <input
          type="text"
          value={form.defPartOfSpeech}
          onChange={(e) => {
            onChange({ defPartOfSpeech: e.target.value });
          }}
          placeholder="noun, verb, adjective..."
          className={inputClass}
        />
      </FieldGroup>
      <FieldGroup label="Examples (one per line, optional)">
        <textarea
          value={form.defExamples}
          onChange={(e) => {
            onChange({ defExamples: e.target.value });
          }}
          rows={3}
          placeholder={'Example sentence 1\nExample sentence 2'}
          className={textareaClass}
        />
      </FieldGroup>
    </div>
  );
}

function TrueFalseForm({ form, onChange }: IFormProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <FieldGroup label="Statement" required>
        <textarea
          value={form.tfStatement}
          onChange={(e) => {
            onChange({ tfStatement: e.target.value });
          }}
          rows={3}
          placeholder="Enter the statement..."
          className={textareaClass}
        />
      </FieldGroup>
      <FieldGroup label="Correct answer">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.tfIsTrue}
            onChange={(e) => {
              onChange({ tfIsTrue: e.target.checked });
            }}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <span className="text-sm">
            Statement is <strong>true</strong>
          </span>
        </label>
      </FieldGroup>
      <FieldGroup label="Explanation (optional)">
        <textarea
          value={form.tfExplanation}
          onChange={(e) => {
            onChange({ tfExplanation: e.target.value });
          }}
          rows={2}
          placeholder="Why is this true or false?"
          className={textareaClass}
        />
      </FieldGroup>
    </div>
  );
}

function MultipleChoiceForm({ form, onChange }: IFormProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <FieldGroup label="Question" required>
        <textarea
          value={form.mcQuestion}
          onChange={(e) => {
            onChange({ mcQuestion: e.target.value });
          }}
          rows={3}
          placeholder="Enter the question..."
          className={textareaClass}
        />
      </FieldGroup>
      <FieldGroup
        label="Choices (one per line — prefix correct choice(s) with *)"
        required
        hint="Example: *Paris (correct), London, Berlin"
      >
        <textarea
          value={form.mcChoices}
          onChange={(e) => {
            onChange({ mcChoices: e.target.value });
          }}
          rows={5}
          placeholder={'*Correct answer\nWrong answer 1\nWrong answer 2\nWrong answer 3'}
          className={textareaClass}
        />
      </FieldGroup>
      <FieldGroup label="Explanation (optional)">
        <textarea
          value={form.mcExplanation}
          onChange={(e) => {
            onChange({ mcExplanation: e.target.value });
          }}
          rows={2}
          placeholder="Why is this the correct answer?"
          className={textareaClass}
        />
      </FieldGroup>
    </div>
  );
}

interface IComplexJsonFormProps {
  cardType: string;
  value: string;
  error: string | null;
  onChange: (v: string) => void;
}

function ComplexJsonForm({
  cardType,
  value,
  error,
  onChange,
}: IComplexJsonFormProps): React.JSX.Element {
  const placeholder = getComplexPlaceholder(cardType);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Content (JSON)</label>
        <span className="text-xs text-muted-foreground">
          Phase 10 will replace this with a rich editor (ADR-007 D6)
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        rows={12}
        placeholder={placeholder}
        spellCheck={false}
        className={[
          textareaClass,
          'font-mono text-xs',
          error !== null ? 'border-destructive focus:ring-destructive' : '',
        ].join(' ')}
      />
      {error !== null && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Enter valid JSON matching the content schema for{' '}
        <code className="rounded bg-muted px-1 py-0.5">{cardType}</code>.
      </p>
    </div>
  );
}

// ============================================================================
// Step 3 — Settings
// ============================================================================

interface IStep3Props {
  cardType: string;
  settings: ISettingsFormData;
  kgNodes: IGraphNodeDto[];
  kgNodesLoading: boolean;
  isCreatingNode: boolean;
  nodeCreateError: string | null;
  onChange: (patch: Partial<ISettingsFormData>) => void;
  onCreateNode: (input: ICreateNodeInput) => Promise<IGraphNodeDto>;
  isSubmitting: boolean;
  submitError: string | null;
  onBack: () => void;
  onSubmit: () => void;
}

function Step3Settings({
  cardType,
  settings,
  kgNodes,
  kgNodesLoading,
  isCreatingNode,
  nodeCreateError,
  onChange,
  onCreateNode,
  isSubmitting,
  submitError,
  onBack,
  onSubmit,
}: IStep3Props): React.JSX.Element {
  const [nodeSearch, setNodeSearch] = React.useState('');
  const [manualEntryOpen, setManualEntryOpen] = React.useState(false);
  const [newNodeType, setNewNodeType] = React.useState<NodeType>('concept');
  const [newNodeDescription, setNewNodeDescription] = React.useState('');

  const selectedNodeIds = React.useMemo(
    () => normalizeKnowledgeNodeIds(settings.knowledgeNodeIds),
    [settings.knowledgeNodeIds]
  );

  const selectedNodeMap = React.useMemo(() => {
    const map = new Map<string, IGraphNodeDto>();
    for (const node of kgNodes) {
      map.set(node.id, node);
    }
    return map;
  }, [kgNodes]);

  const trimmedNodeSearch = nodeSearch.trim();
  const searchLower = trimmedNodeSearch.toLowerCase();
  const filteredNodes = React.useMemo(() => {
    if (searchLower === '') return kgNodes.slice(0, 12);
    return kgNodes
      .filter(
        (node) =>
          node.label.toLowerCase().includes(searchLower) ||
          node.type.toLowerCase().includes(searchLower) ||
          node.id.toLowerCase().includes(searchLower)
      )
      .slice(0, 12);
  }, [kgNodes, searchLower]);
  const exactLabelMatch = React.useMemo(
    () => kgNodes.find((node) => node.label.trim().toLowerCase() === searchLower),
    [kgNodes, searchLower]
  );

  function setSelectedNodeIds(nextIds: string[]): void {
    onChange({ knowledgeNodeIds: nextIds.join(', ') });
  }

  function handleAddNode(nodeId: string): void {
    if (selectedNodeIds.includes(nodeId)) return;
    setSelectedNodeIds([...selectedNodeIds, nodeId]);
  }

  function handleRemoveNode(nodeId: string): void {
    setSelectedNodeIds(selectedNodeIds.filter((id) => id !== nodeId));
  }

  const selectedNodeValidationError = React.useMemo(
    () => validateKnowledgeNodeIds(selectedNodeIds),
    [selectedNodeIds]
  );
  const exactMatchAlreadySelected =
    exactLabelMatch !== undefined && selectedNodeIds.includes(exactLabelMatch.id);

  async function handleCreateNode(): Promise<void> {
    if (trimmedNodeSearch === '') return;
    try {
      const createdNode = await onCreateNode({
        label: trimmedNodeSearch,
        type: newNodeType,
        ...(newNodeDescription.trim() !== '' ? { description: newNodeDescription.trim() } : {}),
      });

      handleAddNode(createdNode.id);
      setNodeSearch('');
      setNewNodeDescription('');
      setNewNodeType('concept');
    } catch {
      // Parent state already captures and renders the error.
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-md border border-border bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
        Card type: <span className="font-semibold text-foreground">{labelForType(cardType)}</span>
      </div>

      {/* Tags */}
      <FieldGroup label="Tags (comma-separated, optional)">
        <input
          type="text"
          value={settings.tags}
          onChange={(e) => {
            onChange({ tags: e.target.value });
          }}
          placeholder="biology, chapter-3, hard"
          className={inputClass}
        />
      </FieldGroup>

      {/* Knowledge Nodes */}
      <FieldGroup
        label="Knowledge graph nodes (optional)"
        hint="Search and select nodes by name. IDs are handled automatically."
      >
        <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/20 p-3">
          <input
            type="text"
            value={nodeSearch}
            onChange={(e) => {
              setNodeSearch(e.target.value);
            }}
            placeholder="Search node label, type, or ID"
            className={inputClass}
          />

          {trimmedNodeSearch !== '' && (
            <div className="rounded-md border border-dashed border-border bg-background/60 p-3">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-foreground">
                    {exactLabelMatch !== undefined
                      ? 'A matching node already exists'
                      : 'Create a new PKG node from this label'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {exactLabelMatch !== undefined
                      ? 'Use the existing node or create a more specific label.'
                      : 'This creates the node in your personal knowledge graph and attaches this card to it.'}
                  </p>
                </div>

                {exactLabelMatch !== undefined ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        handleAddNode(exactLabelMatch.id);
                      }}
                      disabled={exactMatchAlreadySelected}
                      className={secondaryBtnClass}
                    >
                      {exactMatchAlreadySelected ? 'Already selected' : 'Attach existing node'}
                    </button>
                    <span className="text-xs text-muted-foreground">
                      {exactLabelMatch.label} · {exactLabelMatch.type}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr),minmax(0,1fr)]">
                      <FieldGroup label="New node label" required>
                        <input
                          type="text"
                          value={trimmedNodeSearch}
                          readOnly
                          className={inputClass}
                        />
                      </FieldGroup>
                      <FieldGroup label="Node type">
                        <select
                          value={newNodeType}
                          onChange={(e) => {
                            setNewNodeType(e.target.value as NodeType);
                          }}
                          className={selectClass}
                        >
                          {NODE_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label} — {option.description}
                            </option>
                          ))}
                        </select>
                      </FieldGroup>
                    </div>

                    <FieldGroup
                      label="Description (optional)"
                      hint="Useful when the label is short or ambiguous."
                    >
                      <textarea
                        value={newNodeDescription}
                        onChange={(e) => {
                          setNewNodeDescription(e.target.value);
                        }}
                        rows={2}
                        placeholder="Optional description for the new knowledge node"
                        className={textareaClass}
                      />
                    </FieldGroup>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void handleCreateNode();
                        }}
                        disabled={isCreatingNode}
                        className={primaryBtnClass}
                      >
                        {isCreatingNode ? 'Creating node…' : 'Create and attach node'}
                      </button>
                      <span className="text-xs text-muted-foreground">
                        The card will still save through the Content service after the node is
                        created.
                      </span>
                    </div>
                  </>
                )}

                {nodeCreateError !== null && (
                  <p className="text-xs text-destructive">{nodeCreateError}</p>
                )}
              </div>
            </div>
          )}

          {selectedNodeIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedNodeIds.map((id) => {
                const node = selectedNodeMap.get(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      handleRemoveNode(id);
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs hover:bg-muted"
                    title="Click to remove"
                  >
                    <span>{node?.label ?? id}</span>
                    <span className="text-muted-foreground">×</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-background">
            {kgNodesLoading ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">Loading knowledge nodes…</p>
            ) : filteredNodes.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">No matching nodes found.</p>
            ) : (
              <ul className="divide-y divide-border">
                {filteredNodes.map((node) => {
                  const selected = selectedNodeIds.includes(node.id);
                  return (
                    <li key={node.id}>
                      <button
                        type="button"
                        onClick={() => {
                          handleAddNode(node.id);
                        }}
                        disabled={selected}
                        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <div className="flex flex-col">
                          <span className="text-sm">{node.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {node.type} · {node.id}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {selected ? 'Selected' : 'Add'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="text-xs text-muted-foreground">
            Selected {String(selectedNodeIds.length)} / 50 knowledge nodes.
          </div>

          {selectedNodeValidationError !== null && (
            <p className="text-xs text-destructive">{selectedNodeValidationError}</p>
          )}

          <div className="border-t border-border pt-2">
            <button
              type="button"
              onClick={() => {
                setManualEntryOpen((prev) => !prev);
              }}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              {manualEntryOpen ? 'Hide advanced manual ID entry' : 'Show advanced manual ID entry'}
            </button>

            {manualEntryOpen && (
              <div className="mt-2 flex flex-col gap-1.5">
                <input
                  type="text"
                  value={settings.knowledgeNodeIds}
                  onChange={(e) => {
                    onChange({ knowledgeNodeIds: e.target.value });
                  }}
                  placeholder="node_abcdefghijklmnopqrstu, node_bcdefghijklmnopqrstuv"
                  className={inputClass}
                />
                <p className="text-xs text-muted-foreground">
                  Advanced mode: comma-separated IDs. Format: node_ + 21 alphanumeric chars.
                </p>
              </div>
            )}
          </div>
        </div>
      </FieldGroup>

      {/* Difficulty */}
      <FieldGroup
        label="Difficulty (0.0 – 1.0, optional)"
        hint="Leave blank to let the system determine difficulty"
      >
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={settings.difficulty}
          onChange={(e) => {
            onChange({ difficulty: e.target.value });
          }}
          placeholder="0.5"
          className={inputClass}
        />
      </FieldGroup>

      {/* State */}
      <FieldGroup label="Initial state">
        <select
          value={settings.state}
          onChange={(e) => {
            onChange({ state: e.target.value as 'ACTIVE' | 'DRAFT' });
          }}
          className={selectClass}
        >
          <option value="ACTIVE">Active — immediately available for review</option>
          <option value="DRAFT">Draft — hidden from review sessions</option>
        </select>
      </FieldGroup>

      {/* Batch mode toggle */}
      <div className="rounded-lg border border-border p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.batchMode}
            onChange={(e) => {
              onChange({ batchMode: e.target.checked });
            }}
            className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
          />
          <div>
            <span className="text-sm font-medium">Batch mode — create multiple cards at once</span>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Provide a JSON array of card content objects. All cards will share the settings above.
            </p>
          </div>
        </label>

        {settings.batchMode && (
          <div className="mt-4 flex flex-col gap-2">
            <label className="text-sm font-medium">
              Batch content (JSON array of content objects)
            </label>
            <textarea
              value={settings.batchJson}
              onChange={(e) => {
                onChange({ batchJson: e.target.value });
              }}
              rows={10}
              spellCheck={false}
              placeholder={JSON.stringify(
                [
                  { front: 'Question 1', back: 'Answer 1' },
                  { front: 'Question 2', back: 'Answer 2' },
                ],
                null,
                2
              )}
              className={[textareaClass, 'font-mono text-xs'].join(' ')}
            />
            <p className="text-xs text-muted-foreground">
              Each element is the <code className="rounded bg-muted px-1 py-0.5">content</code>{' '}
              object for one card of type{' '}
              <code className="rounded bg-muted px-1 py-0.5">{cardType}</code>.
            </p>
          </div>
        )}
      </div>

      {/* Submit error */}
      {submitError !== null && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {submitError}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className={secondaryBtnClass}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting}
          className={[primaryBtnClass, 'disabled:pointer-events-none disabled:opacity-50'].join(
            ' '
          )}
        >
          {isSubmitting ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          {settings.batchMode ? 'Create Batch' : 'Create Card'}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Step 4 — Result
// ============================================================================

interface IStep4Props {
  result: CreatedResult;
  onCreateAnother: () => void;
}

function Step4Result({ result, onCreateAnother }: IStep4Props): React.JSX.Element {
  const router = useRouter();

  if (result.mode === 'single') {
    const { card } = result;
    return (
      <div className="flex flex-col items-center gap-6 py-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Check className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Card created successfully</h2>
          <p className="mt-1 text-sm text-muted-foreground">Card ID: {card.id}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              router.push(`/cards/${card.id}` as Route);
            }}
            className={primaryBtnClass}
          >
            View Card
          </button>
          <button
            type="button"
            onClick={() => {
              router.push('/cards');
            }}
            className={secondaryBtnClass}
          >
            View Library
          </button>
          <button type="button" onClick={onCreateAnother} className={secondaryBtnClass}>
            <Plus className="h-4 w-4" />
            Create Another
          </button>
        </div>
      </div>
    );
  }

  // Batch result
  const { batchId, created, total, failed } = result;
  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Check className="h-8 w-8 text-primary" />
      </div>
      <div>
        <h2 className="text-xl font-semibold">Batch created successfully</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Batch ID: {batchId} &mdash; {String(created.length)} of {String(total)} card
          {total === 1 ? '' : 's'} created
          {failed > 0 ? [', ', String(failed), ' failed'].join('') : ''}.
        </p>
      </div>

      {created.length > 0 && (
        <div className="w-full max-w-md rounded-lg border border-border bg-muted/20 p-4 text-left">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Created Cards
          </p>
          <ul className="flex flex-col gap-1">
            {created.map((card) => (
              <li key={card.id} className="flex items-center justify-between text-sm">
                <code className="text-xs text-muted-foreground">{card.id}</code>
                <button
                  type="button"
                  onClick={() => {
                    router.push(`/cards/${card.id}` as Route);
                  }}
                  className="ml-2 text-xs text-primary underline-offset-2 hover:underline"
                >
                  View
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => {
            router.push('/cards');
          }}
          className={primaryBtnClass}
        >
          View Library
        </button>
        <button type="button" onClick={onCreateAnother} className={secondaryBtnClass}>
          <Plus className="h-4 w-4" />
          Create Another
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Shared UI primitives
// ============================================================================

const inputClass = [
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm',
  'placeholder:text-muted-foreground',
  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0',
  'transition-colors',
].join(' ');

const textareaClass = [
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed',
  'placeholder:text-muted-foreground',
  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0',
  'resize-y transition-colors',
].join(' ');

const selectClass = [
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm',
  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0',
  'transition-colors',
].join(' ');

const primaryBtnClass = [
  'inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2',
  'text-sm font-medium text-primary-foreground transition-colors',
  'hover:bg-primary/90',
  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
].join(' ');

const secondaryBtnClass = [
  'inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2',
  'text-sm font-medium text-foreground transition-colors',
  'hover:bg-muted',
  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
].join(' ');

interface IFieldGroupProps {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}

function FieldGroup({ label, required, hint, children }: IFieldGroupProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium">
        {label}
        {required === true && <span className="ml-1 text-destructive">*</span>}
      </label>
      {hint !== undefined && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

interface IStepNavFooterProps {
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
}

function StepNavFooter({
  onBack,
  onNext,
  nextLabel = 'Next',
}: IStepNavFooterProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between pt-2">
      <button type="button" onClick={onBack} className={secondaryBtnClass}>
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>
      <button type="button" onClick={onNext} className={primaryBtnClass}>
        {nextLabel}
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ============================================================================
// Step Indicator
// ============================================================================

interface IStepIndicatorProps {
  current: WizardStep;
}

const STEP_LABELS: Record<WizardStep, string> = {
  1: 'Select Type',
  2: 'Enter Content',
  3: 'Settings',
  4: 'Done',
};

function StepIndicator({ current }: IStepIndicatorProps): React.JSX.Element {
  const steps: WizardStep[] = [1, 2, 3, 4];
  return (
    <nav aria-label="Wizard steps" className="flex items-center gap-2">
      {steps.map((step, idx) => {
        const isComplete = current > step;
        const isActive = current === step;
        return (
          <React.Fragment key={step}>
            {idx > 0 && (
              <div
                className={[
                  'h-px flex-1',
                  isComplete || isActive ? 'bg-primary/60' : 'bg-border',
                ].join(' ')}
              />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                aria-current={isActive ? 'step' : undefined}
                className={[
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold',
                  isComplete
                    ? 'bg-primary text-primary-foreground'
                    : isActive
                      ? 'border-2 border-primary bg-background text-primary'
                      : 'border border-border bg-background text-muted-foreground',
                ].join(' ')}
              >
                {isComplete ? <Check className="h-3.5 w-3.5" /> : String(step)}
              </div>
              <span
                className={[
                  'hidden text-xs sm:block',
                  isActive ? 'font-medium text-foreground' : 'text-muted-foreground',
                ].join(' ')}
              >
                {STEP_LABELS[step]}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </nav>
  );
}

// ============================================================================
// Default state factories
// ============================================================================

function defaultContent(): IContentFormData {
  return {
    atomicFront: '',
    atomicBack: '',
    atomicHint: '',
    defTerm: '',
    defDefinition: '',
    defPartOfSpeech: '',
    defExamples: '',
    tfStatement: '',
    tfIsTrue: true,
    tfExplanation: '',
    mcQuestion: '',
    mcChoices: '',
    mcExplanation: '',
    rawJson: '',
  };
}

function defaultSettings(): ISettingsFormData {
  return {
    tags: '',
    knowledgeNodeIds: '',
    difficulty: '',
    state: 'ACTIVE',
    batchMode: false,
    batchJson: '',
  };
}

// ============================================================================
// Validation helpers
// ============================================================================

/** Returns null if valid, or an error message string. */
function validateStep2(cardType: string, form: IContentFormData): string | null {
  if (cardType === CardType.ATOMIC) {
    if (form.atomicFront.trim() === '') return 'Front text is required.';
    if (form.atomicBack.trim() === '') return 'Back text is required.';
    return null;
  }
  if (cardType === CardType.DEFINITION) {
    if (form.defTerm.trim() === '') return 'Term is required.';
    if (form.defDefinition.trim() === '') return 'Definition is required.';
    return null;
  }
  if (cardType === CardType.TRUE_FALSE) {
    if (form.tfStatement.trim() === '') return 'Statement is required.';
    return null;
  }
  if (cardType === CardType.MULTIPLE_CHOICE) {
    if (form.mcQuestion.trim() === '') return 'Question is required.';
    const hasCorrect = form.mcChoices
      .split('\n')
      .map((s) => s.trim())
      .some((s) => s.startsWith('*'));
    if (!hasCorrect) return 'At least one correct choice (prefixed with *) is required.';
    return null;
  }
  // Complex types — validate JSON
  try {
    const parsed: unknown = JSON.parse(form.rawJson);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return 'Content must be a JSON object.';
    }
    return null;
  } catch {
    return 'Invalid JSON — please check the syntax.';
  }
}

// ============================================================================
// Page (Wizard orchestrator)
// ============================================================================

export default function NewCardPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = (user?.id ?? '') as UserId;
  const { data: pkgNodesData, isLoading: kgNodesLoading } = usePKGNodes(userId);
  const pkgNodes = ensureNodeList(pkgNodesData);

  // --------------------------------------------------------------------------
  // Wizard state
  // --------------------------------------------------------------------------

  const [step, setStep] = React.useState<WizardStep>(1);
  const [selectedType, setSelectedType] = React.useState<string>('');
  const [contentForm, setContentForm] = React.useState<IContentFormData>(defaultContent);
  const [settings, setSettings] = React.useState<ISettingsFormData>(defaultSettings);
  const [result, setResult] = React.useState<CreatedResult | null>(null);

  // Validation error shown inline on Step 2 for JSON / required fields
  const [step2Error, setStep2Error] = React.useState<string | null>(null);
  // Mutation error shown on Step 3
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [nodeCreateError, setNodeCreateError] = React.useState<string | null>(null);

  // --------------------------------------------------------------------------
  // Mutations
  // --------------------------------------------------------------------------

  const createCard = useCreateCard();
  const batchCreate = useBatchCreateCards();
  const createNode = useCreatePKGNode(userId);

  const isSubmitting = createCard.isPending || batchCreate.isPending || createNode.isPending;

  // --------------------------------------------------------------------------
  // Step 1 handlers
  // --------------------------------------------------------------------------

  function handleTypeSelect(cardType: string): void {
    setSelectedType(cardType);
    setContentForm(defaultContent());
    setSettings(defaultSettings());
    setStep2Error(null);
    setSubmitError(null);
    setStep(2);
  }

  // --------------------------------------------------------------------------
  // Step 2 handlers
  // --------------------------------------------------------------------------

  function handleContentChange(patch: Partial<IContentFormData>): void {
    setContentForm((prev) => ({ ...prev, ...patch }));
    setStep2Error(null);
  }

  function handleStep2Next(): void {
    const err = validateStep2(selectedType, contentForm);
    if (err !== null) {
      setStep2Error(err);
      return;
    }
    setStep2Error(null);
    setStep(3);
  }

  // --------------------------------------------------------------------------
  // Step 3 handlers
  // --------------------------------------------------------------------------

  function handleSettingsChange(patch: Partial<ISettingsFormData>): void {
    setSettings((prev) => ({ ...prev, ...patch }));
    setSubmitError(null);
    setNodeCreateError(null);
  }

  async function handleCreateNode(input: ICreateNodeInput): Promise<IGraphNodeDto> {
    setNodeCreateError(null);

    try {
      const response = await createNode.mutateAsync(input);
      return response.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Knowledge node creation failed.';
      setNodeCreateError(message);
      throw err;
    }
  }

  async function handleSubmit(): Promise<void> {
    setSubmitError(null);

    const tags = parseCommaSeparated(settings.tags);
    const knowledgeNodeIds = normalizeKnowledgeNodeIds(settings.knowledgeNodeIds);
    const nodeIdsError = validateKnowledgeNodeIds(knowledgeNodeIds);
    if (nodeIdsError !== null) {
      setSubmitError(nodeIdsError);
      return;
    }
    const difficulty = parseDifficulty(settings.difficulty);

    // Map state label to API value
    const state = settings.state === 'ACTIVE' ? 'active' : 'draft';

    if (settings.batchMode) {
      // Batch creation
      let items: unknown[];
      try {
        const parsed: unknown = JSON.parse(settings.batchJson);
        if (!Array.isArray(parsed)) {
          setSubmitError('Batch JSON must be a JSON array.');
          return;
        }
        items = parsed;
      } catch {
        setSubmitError('Invalid JSON in batch textarea — please check the syntax.');
        return;
      }

      const cards: ICreateCardInput[] = items.map((item) => {
        const card: ICreateCardInput = {
          cardType: selectedType,
          content: item as Record<string, unknown>,
          metadata: difficulty !== undefined ? { difficulty, state } : { state },
        };
        if (tags.length > 0) card.tags = tags;
        if (knowledgeNodeIds.length > 0) card.knowledgeNodeIds = knowledgeNodeIds;
        return card;
      });

      const batchInput: IBatchCreateInput = { cards };

      try {
        const response = await batchCreate.mutateAsync(batchInput);
        void queryClient.invalidateQueries({ queryKey: contentKeys.cards() });
        setResult({
          mode: 'batch',
          batchId: response.data.batchId,
          created: response.data.created,
          total: response.data.total,
          failed: response.data.failed,
        });
        setStep(4);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Batch creation failed.');
      }
      return;
    }

    // Single card creation
    const isSimple = SIMPLE_TYPES.has(selectedType);
    let content: Record<string, unknown>;

    if (isSimple) {
      content = buildContent(selectedType, contentForm);
    } else {
      try {
        content = JSON.parse(contentForm.rawJson) as Record<string, unknown>;
      } catch {
        setSubmitError('Invalid JSON in content field — please fix before submitting.');
        return;
      }
    }

    const input: ICreateCardInput = {
      cardType: selectedType,
      content,
      metadata: difficulty !== undefined ? { difficulty, state } : { state },
    };
    if (tags.length > 0) input.tags = tags;
    if (knowledgeNodeIds.length > 0) input.knowledgeNodeIds = knowledgeNodeIds;

    try {
      const response = await createCard.mutateAsync(input);
      void queryClient.invalidateQueries({ queryKey: contentKeys.cards() });
      setResult({ mode: 'single', card: response.data });
      setStep(4);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Card creation failed.');
    }
  }

  // --------------------------------------------------------------------------
  // Reset wizard
  // --------------------------------------------------------------------------

  function handleCreateAnother(): void {
    setStep(1);
    setSelectedType('');
    setContentForm(defaultContent());
    setSettings(defaultSettings());
    setResult(null);
    setStep2Error(null);
    setSubmitError(null);
    setNodeCreateError(null);
    createCard.reset();
    batchCreate.reset();
    createNode.reset();
  }

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold">Create Card</h1>
        <p className="mt-1 text-muted-foreground">
          Choose a card type, enter content, configure settings, and save.
        </p>
      </div>

      {/* Step indicator */}
      <StepIndicator current={step} />

      {/* Step content */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        {step === 1 && <Step1TypeSelection onSelect={handleTypeSelect} />}

        {step === 2 && selectedType !== '' && (
          <Step2ContentEntry
            cardType={selectedType}
            form={contentForm}
            onChange={handleContentChange}
            jsonError={SIMPLE_TYPES.has(selectedType) ? null : step2Error}
            onBack={() => {
              setStep(1);
            }}
            onNext={handleStep2Next}
          />
        )}

        {step === 3 && (
          <Step3Settings
            cardType={selectedType}
            settings={settings}
            kgNodes={pkgNodes}
            kgNodesLoading={kgNodesLoading}
            isCreatingNode={createNode.isPending}
            nodeCreateError={nodeCreateError}
            onChange={handleSettingsChange}
            onCreateNode={handleCreateNode}
            isSubmitting={isSubmitting}
            submitError={submitError}
            onBack={() => {
              setStep(2);
            }}
            onSubmit={() => {
              void handleSubmit();
            }}
          />
        )}

        {step === 4 && result !== null && (
          <Step4Result result={result} onCreateAnother={handleCreateAnother} />
        )}
      </div>
    </div>
  );
}
