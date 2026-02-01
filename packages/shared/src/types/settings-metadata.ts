// =============================================================================
// SETTINGS METADATA & EXPLANATIONS
// =============================================================================
// Every setting MUST have an explanation. This file contains all metadata
// including explanations, options, validation, and allowed scopes.

import type {
  SettingMetadata,
  CategoryMetadata,
  SettingsCategory,
  StudySettings,
  DisplaySettings,
} from "./settings.types";

// =============================================================================
// CATEGORY METADATA
// =============================================================================

export const CATEGORY_METADATA: Record<SettingsCategory, CategoryMetadata> = {
  study: {
    id: "study",
    name: "Study",
    icon: "school",
    order: 1,
    explanation: {
      summary:
        "Configure how you study, including daily goals, session length, and the spaced repetition algorithm.",
      detailed:
        "Study settings control the core learning experience. These settings affect how many cards you see, how often you review them, and how the spaced repetition algorithm schedules your reviews. Getting these right is crucial for effective learning.",
      impact:
        "Directly affects your daily study workload, retention rate, and learning efficiency.",
      tips: [
        "Start with lower daily goals and increase gradually as you build a habit.",
        "The default FSRS algorithm works well for most learners.",
        "Adjust learning steps based on how quickly you learn new material.",
      ],
      warnings: [
        "Setting daily goals too high can lead to burnout.",
        "Changing the scheduler algorithm will reset card scheduling data.",
      ],
    },
  },
  display: {
    id: "display",
    name: "Display",
    icon: "palette",
    order: 2,
    explanation: {
      summary:
        "Customize the visual appearance of the app, including theme, fonts, and card display.",
      detailed:
        "Display settings let you personalize how the app looks and feels. Choose a theme that's easy on your eyes, adjust font sizes for comfortable reading, and decide what information to show on cards.",
      impact:
        "Affects visual comfort and the information density of the study interface.",
      tips: [
        "Use dark mode in low-light conditions to reduce eye strain.",
        'Enable "Show Button Times" to make better rating decisions.',
      ],
    },
  },
  audio: {
    id: "audio",
    name: "Audio",
    icon: "volume-high",
    order: 3,
    explanation: {
      summary:
        "Control sound effects, haptic feedback, and text-to-speech settings.",
      detailed:
        "Audio settings manage all auditory and tactile feedback in the app. This includes sound effects for actions, haptic feedback on touch, and text-to-speech for card content.",
      impact:
        "Affects the sensory feedback during study sessions and accessibility for auditory learners.",
      tips: [
        "Enable TTS for language learning to improve pronunciation.",
        "Use subtle sounds if you study in quiet environments.",
      ],
    },
  },
  notifications: {
    id: "notifications",
    name: "Notifications",
    icon: "notifications",
    order: 4,
    explanation: {
      summary: "Configure reminders, alerts, and email notifications.",
      detailed:
        "Notification settings help you stay on track with your learning goals. Set up daily reminders, streak warnings, and weekly summaries to maintain consistency.",
      impact:
        "Affects how and when you receive reminders about your study schedule.",
      tips: [
        "Set your daily reminder for when you're most likely to have free time.",
        "Enable streak reminders to avoid breaking long streaks.",
      ],
    },
  },
  privacy: {
    id: "privacy",
    name: "Privacy",
    icon: "shield-checkmark",
    order: 5,
    explanation: {
      summary:
        "Manage data sharing, analytics, and profile visibility settings.",
      detailed:
        "Privacy settings control what data is collected and shared. We believe in transparency—you have full control over your data.",
      impact: "Affects what data is collected, stored, and shared with others.",
      tips: [
        "Enable analytics to help us improve the app.",
        "You can participate in leaderboards without making your profile public.",
      ],
      warnings: [
        "Disabling crash reporting makes it harder for us to fix issues you encounter.",
      ],
    },
  },
  sync: {
    id: "sync",
    name: "Sync",
    icon: "cloud-sync",
    order: 6,
    explanation: {
      summary:
        "Configure cloud synchronization, offline mode, and backup settings.",
      detailed:
        "Sync settings manage how your data is synchronized across devices and backed up. Proper sync settings ensure you never lose progress and can study seamlessly on any device.",
      impact:
        "Affects data availability, storage usage, and how conflicts are resolved.",
      tips: [
        "Enable Wi-Fi only sync if you have limited mobile data.",
        "Keep automatic backups enabled for peace of mind.",
      ],
      warnings: [
        "Disabling sync means changes won't be available on other devices.",
      ],
    },
  },
  accessibility: {
    id: "accessibility",
    name: "Accessibility",
    icon: "accessibility",
    order: 7,
    explanation: {
      summary: "Accessibility features for visual, motor, and cognitive needs.",
      detailed:
        "Accessibility settings make the app usable for everyone. These features help users with visual impairments, motor difficulties, or sensitivity to motion.",
      impact:
        "Makes the app more usable for users with different accessibility needs.",
      tips: [
        "Enable Reduce Motion if animations cause discomfort.",
        "Use Large Text if you have difficulty reading small text.",
      ],
    },
  },
  ai: {
    id: "ai",
    name: "AI Features",
    icon: "sparkles",
    order: 8,
    explanation: {
      summary:
        "AI-powered features for enhanced learning. All AI features are opt-in and require explicit consent.",
      detailed:
        "AI settings control optional artificial intelligence features that can help optimize your learning. These features analyze your study patterns and content to provide personalized suggestions. ALL AI FEATURES ARE OPT-IN—nothing is enabled by default.",
      impact:
        "Enables AI assistance for card creation, scheduling optimization, and learning insights.",
      tips: [
        "Start with just AI study suggestions before enabling content analysis.",
        "Review AI suggestions carefully before accepting changes.",
      ],
      warnings: [
        "AI features send data to our servers for processing.",
        "AI suggestions are not always correct—always verify important information.",
      ],
    },
  },
  advanced: {
    id: "advanced",
    name: "Advanced",
    icon: "construct",
    order: 9,
    explanation: {
      summary: "Developer options, experimental features, and data management.",
      detailed:
        "Advanced settings are for power users who want more control. These include debugging tools, experimental features, and data management options.",
      impact: "Provides additional control and debugging capabilities.",
      tips: [
        "Enable debug mode only when troubleshooting issues.",
        "Export your data regularly as an additional backup.",
      ],
      warnings: [
        "Experimental features may be unstable or change without notice.",
        "Debug mode may affect performance.",
      ],
    },
  },
  plugins: {
    id: "plugins",
    name: "Plugins",
    icon: "extension-puzzle",
    order: 10,
    explanation: {
      summary: "Settings contributed by installed plugins.",
      detailed:
        "Plugins can extend the app with additional features. Each plugin may contribute its own settings, which appear in this section.",
      impact: "Affects behavior of installed plugins.",
      tips: [
        "Only install plugins from trusted sources.",
        "Review plugin permissions before installation.",
      ],
    },
  },
};

// =============================================================================
// STUDY SETTINGS METADATA
// =============================================================================

export const STUDY_SETTINGS_METADATA: SettingMetadata<
  StudySettings[keyof StudySettings]
>[] = [
  // === Daily Goals ===
  {
    key: "study.dailyGoal",
    category: "study",
    subcategory: "Daily Goals",
    name: "Daily Card Goal",
    explanation: {
      summary: "The number of cards you aim to study each day.",
      detailed:
        "This is your target for total cards (new + reviews) per day. The app will show progress toward this goal and notify you when you've reached it. This is a soft limit—you can always study more if you want.",
      impact:
        "Higher goals mean more study time but faster progress. Lower goals are more sustainable long-term.",
      tips: [
        "Start with 20-30 cards/day if you're new to spaced repetition.",
        "Increase gradually as you build consistency.",
        "Your actual workload depends on how many cards are due for review.",
      ],
      warnings: [
        "Don't set this higher than you can consistently achieve.",
        "A pile-up of due cards (backlog) is discouraging and harms retention.",
      ],
      relatedSettings: ["study.newCardsPerDay", "study.maxReviewsPerDay"],
    },
    type: "range",
    defaultValue: 50,
    validation: { min: 10, max: 500, step: 5 },
    allowedScopes: ["global", "profile", "deck"],
  },
  {
    key: "study.newCardsPerDay",
    category: "study",
    subcategory: "Daily Goals",
    name: "New Cards Per Day",
    explanation: {
      summary: "Maximum number of new cards to introduce each day.",
      detailed:
        "Controls the influx of new material. Each new card creates future reviews, so this setting has a compounding effect on workload. New cards are harder than reviews because you haven't seen them before.",
      impact:
        "More new cards = faster initial learning but heavier review load later. Fewer new cards = slower start but more sustainable.",
      tips: [
        "10-20 new cards/day is sustainable for most learners.",
        "Before an exam, you might increase this temporarily.",
        "If reviews pile up, reduce this to 0 until you catch up.",
      ],
      warnings: [
        "Adding too many new cards leads to overwhelming review counts.",
        "Each new card generates 5-7 reviews in the first month.",
      ],
      relatedSettings: [
        "study.dailyGoal",
        "study.maxReviewsPerDay",
        "study.learningSteps",
      ],
    },
    type: "range",
    defaultValue: 20,
    validation: { min: 0, max: 100, step: 1 },
    allowedScopes: ["global", "profile", "deck"],
  },
  {
    key: "study.maxReviewsPerDay",
    category: "study",
    subcategory: "Daily Goals",
    name: "Maximum Reviews Per Day",
    explanation: {
      summary: "Upper limit on review cards shown per day.",
      detailed:
        "This is a hard cap on reviews. If you have more cards due than this limit, excess cards are postponed to the next day. This prevents review pile-ups from becoming unmanageable.",
      impact:
        "Acts as a safety valve to prevent burnout. Cards exceeding this limit are delayed.",
      tips: [
        "200 is a good default for most users.",
        "Increase if you have time and want to prevent backlogs.",
        "Decrease temporarily during busy periods.",
      ],
      warnings: [
        "Setting this too low may cause cards to pile up.",
        "Cards delayed by this limit don't disappear—they accumulate.",
      ],
      relatedSettings: ["study.dailyGoal", "study.newCardsPerDay"],
    },
    type: "range",
    defaultValue: 200,
    validation: { min: 50, max: 9999, step: 10 },
    allowedScopes: ["global", "profile", "deck"],
  },

  // === Session Settings ===
  {
    key: "study.sessionDuration",
    category: "study",
    subcategory: "Session Settings",
    name: "Target Session Duration",
    explanation: {
      summary: "How long you want each study session to last (in minutes).",
      detailed:
        "The app will track your session time and optionally notify you when you've reached your target. This helps maintain focus and prevents over-studying.",
      impact:
        "Shorter sessions (15-25 min) maintain focus. Longer sessions (30-60 min) cover more material.",
      tips: [
        "20-25 minutes aligns with the Pomodoro Technique.",
        "Take breaks between sessions to consolidate memory.",
      ],
    },
    type: "range",
    defaultValue: 20,
    validation: { min: 5, max: 120, step: 5 },
    allowedScopes: ["global", "profile", "session"],
  },
  {
    key: "study.enableSessionTimer",
    category: "study",
    subcategory: "Session Settings",
    name: "Show Session Timer",
    explanation: {
      summary: "Display a timer showing how long you've been studying.",
      detailed:
        "When enabled, a timer appears during study sessions. This helps you track your study time and know when to take breaks.",
      impact:
        "Provides awareness of time spent but may feel pressuring to some users.",
    },
    type: "boolean",
    defaultValue: true,
    allowedScopes: ["global", "profile"],
  },
  {
    key: "study.showSessionProgress",
    category: "study",
    subcategory: "Session Settings",
    name: "Show Session Progress",
    explanation: {
      summary: "Display a progress bar during study sessions.",
      detailed:
        "Shows how many cards you've completed and how many remain. Includes new cards, learning cards, and review cards.",
      impact:
        "Helps track progress but may create anxiety about remaining cards.",
    },
    type: "boolean",
    defaultValue: true,
    allowedScopes: ["global", "profile"],
  },
  {
    key: "study.breakReminder",
    category: "study",
    subcategory: "Session Settings",
    name: "Break Reminder",
    explanation: {
      summary: "Get reminded to take breaks during long study sessions.",
      detailed:
        "After studying continuously for the specified interval, you'll get a gentle reminder to take a break. Breaks improve retention and prevent fatigue.",
      impact: "Helps maintain focus and retention during long study sessions.",
      tips: [
        "Even a 5-minute break can significantly improve focus.",
        "Use breaks to stretch, hydrate, or rest your eyes.",
      ],
    },
    type: "boolean",
    defaultValue: true,
    allowedScopes: ["global", "profile"],
  },
  {
    key: "study.breakReminderInterval",
    category: "study",
    subcategory: "Session Settings",
    name: "Break Reminder Interval",
    explanation: {
      summary: "Minutes of continuous study before suggesting a break.",
      detailed:
        "After this many minutes of uninterrupted study, you'll receive a break reminder. The timer resets after each break.",
      impact:
        "Shorter intervals mean more frequent breaks. Longer intervals allow deeper focus periods.",
    },
    type: "range",
    defaultValue: 25,
    validation: { min: 15, max: 60, step: 5 },
    allowedScopes: ["global", "profile"],
  },

  // === Review Order & Behavior ===
  {
    key: "study.reviewOrder",
    category: "study",
    subcategory: "Review Behavior",
    name: "Review Order",
    explanation: {
      summary: "The order in which due cards are presented.",
      detailed:
        "Determines how cards are sorted when you start a review session. Different orders can affect learning efficiency and motivation.",
      impact:
        "Affects which cards you see first and the overall flow of your review session.",
      tips: [
        '"Due Date" ensures overdue cards are prioritized.',
        '"Random" prevents pattern learning and adds variety.',
        '"Difficulty" lets you tackle hard cards when fresh.',
      ],
    },
    type: "enum",
    defaultValue: "due_date",
    options: [
      {
        value: "due_date",
        label: "Due Date (Oldest First)",
        description: "Cards that have been waiting longest are shown first.",
        useCase: "Best for maintaining optimal review timing.",
        tradeoffs: "May feel monotonous if many cards from same deck are due.",
      },
      {
        value: "random",
        label: "Random",
        description: "Cards are shuffled randomly.",
        useCase: "Good for variety and preventing pattern recognition.",
        tradeoffs: "Some overdue cards may be delayed further.",
      },
      {
        value: "difficulty",
        label: "Difficulty (Hardest First)",
        description: "Most difficult cards are shown first.",
        useCase: "Tackle hard cards when your focus is fresh.",
        tradeoffs: "May be discouraging if many cards are difficult.",
      },
      {
        value: "deck_order",
        label: "Deck Order",
        description: "Cards are shown grouped by deck.",
        useCase: "Good for context-heavy subjects where related cards help.",
        tradeoffs: "May lead to pattern recognition within decks.",
      },
    ],
    allowedScopes: ["global", "profile", "deck", "session"],
  },
  {
    key: "study.mixNewAndReview",
    category: "study",
    subcategory: "Review Behavior",
    name: "Mix New and Review Cards",
    explanation: {
      summary: "Interleave new cards with review cards.",
      detailed:
        "When enabled, new cards are mixed in with your reviews. When disabled, you'll see all reviews first, then all new cards (or vice versa).",
      impact:
        "Mixing provides variety; separation allows focused learning phases.",
      tips: [
        "Mixing is generally better for long-term retention.",
        "Separation can help if you want to focus on reviews first.",
      ],
    },
    type: "boolean",
    defaultValue: true,
    allowedScopes: ["global", "profile", "deck"],
  },
  {
    key: "study.newCardPosition",
    category: "study",
    subcategory: "Review Behavior",
    name: "New Card Position",
    explanation: {
      summary: "Where to show new cards in the queue.",
      detailed:
        "Controls whether new cards appear at the beginning, end, or mixed throughout your study session.",
      impact: "Affects when you encounter new material during a session.",
    },
    type: "enum",
    defaultValue: "mixed",
    options: [
      {
        value: "first",
        label: "First",
        description: "New cards are shown before reviews.",
        useCase: "Learn new material when you're fresh.",
        tradeoffs: "Reviews may feel like a slog after tackling new cards.",
      },
      {
        value: "last",
        label: "Last",
        description: "New cards are shown after reviews.",
        useCase: "Prioritize maintaining existing knowledge.",
        tradeoffs: "May not reach new cards if tired after reviews.",
      },
      {
        value: "mixed",
        label: "Mixed",
        description: "New cards are interspersed with reviews.",
        useCase: "Balanced approach with variety.",
        tradeoffs: "Less predictable session structure.",
      },
    ],
    allowedScopes: ["global", "profile", "deck"],
  },
  {
    key: "study.autoShowAnswerDelay",
    category: "study",
    subcategory: "Review Behavior",
    name: "Auto-Show Answer Delay",
    explanation: {
      summary:
        "Automatically reveal the answer after this many seconds (0 = disabled).",
      detailed:
        "If set to a value greater than 0, the answer will automatically be revealed after the specified delay. Useful for timed practice.",
      impact: "Adds time pressure to reviews. Set to 0 for self-paced review.",
      tips: [
        "Try 30-60 seconds if you tend to overthink answers.",
        "Keep at 0 if time pressure causes anxiety.",
      ],
    },
    type: "range",
    defaultValue: 0,
    validation: { min: 0, max: 120, step: 5 },
    allowedScopes: ["global", "profile", "deck", "session"],
  },

  // === Learning Steps ===
  {
    key: "study.learningSteps",
    category: "study",
    subcategory: "Learning Steps",
    name: "Learning Steps",
    explanation: {
      summary: "Intervals (in minutes) for newly learned cards.",
      detailed:
        'When you see a new card, it goes through these intervals before "graduating" to the review queue. For example, [1, 10] means: see again in 1 minute, then 10 minutes, then it graduates.',
      impact:
        "More steps = stronger initial learning but longer sessions. Fewer steps = faster graduation but potentially weaker initial memory.",
      tips: [
        "[1, 10] is good for easy material.",
        "[1, 10, 60, 1440] (1min, 10min, 1hr, 1day) is thorough for difficult material.",
        "Add a 1-day step if cards keep graduating too easily.",
      ],
      warnings: [
        "Too many steps can make sessions very long.",
        "Steps over 1440 minutes (1 day) effectively add extra days before graduation.",
      ],
      relatedSettings: ["study.graduatingInterval", "study.relearningSteps"],
    },
    type: "array",
    defaultValue: [1, 10],
    validation: { min: 1, max: 1440 * 7 },
    allowedScopes: ["global", "profile", "deck", "template"],
  },
  {
    key: "study.relearningSteps",
    category: "study",
    subcategory: "Learning Steps",
    name: "Relearning Steps",
    explanation: {
      summary: "Intervals (in minutes) for cards you've forgotten.",
      detailed:
        'When you fail a review (press "Again"), the card enters relearning with these intervals before returning to reviews.',
      impact:
        "More steps = stronger relearning. Fewer steps = faster return to reviews.",
      tips: [
        "[10] is minimal—one chance to see it again.",
        "[10, 60] gives you two chances before it returns to reviews.",
      ],
      relatedSettings: ["study.learningSteps", "study.lapseNewInterval"],
    },
    type: "array",
    defaultValue: [10],
    validation: { min: 1, max: 1440 * 7 },
    allowedScopes: ["global", "profile", "deck", "template"],
  },
  {
    key: "study.graduatingInterval",
    category: "study",
    subcategory: "Learning Steps",
    name: "Graduating Interval",
    explanation: {
      summary: "Days until first review after a card graduates from learning.",
      detailed:
        "After a new card completes all learning steps, this is the interval before its first review. This is when the card truly enters the spaced repetition cycle.",
      impact:
        "Higher = more confidence in initial learning required. Lower = quicker reinforcement.",
      tips: [
        "1 day is standard—you'll see the card again tomorrow.",
        "Use 2-3 days if you find cards too easy after graduation.",
      ],
      relatedSettings: ["study.learningSteps", "study.easyInterval"],
    },
    type: "range",
    defaultValue: 1,
    validation: { min: 1, max: 365, step: 1 },
    allowedScopes: ["global", "profile", "deck", "template"],
  },
  {
    key: "study.easyInterval",
    category: "study",
    subcategory: "Learning Steps",
    name: "Easy Interval",
    explanation: {
      summary: 'Days until first review when you rate a new card "Easy".',
      detailed:
        'If you rate a new card as "Easy" during learning, it skips remaining learning steps and goes directly to review with this interval.',
      impact: "Allows quick graduation of material you already know.",
      tips: [
        "4 days is standard—material you already know gets reviewed in 4 days.",
        'Increase if you find "Easy" cards coming back too soon.',
      ],
      relatedSettings: ["study.graduatingInterval"],
    },
    type: "range",
    defaultValue: 4,
    validation: { min: 1, max: 365, step: 1 },
    allowedScopes: ["global", "profile", "deck", "template"],
  },

  // === Lapse Handling ===
  {
    key: "study.lapseNewInterval",
    category: "study",
    subcategory: "Lapses",
    name: "New Interval After Lapse",
    explanation: {
      summary: "Percentage of previous interval after forgetting a card.",
      detailed:
        "When you forget a card, its interval is multiplied by this percentage. 0% means it starts over; 50% means half the previous interval.",
      impact:
        "Higher = more forgiveness for lapses. Lower = more conservative (more reviews).",
      tips: [
        "0% (start over) is safest for important material.",
        "50% is a reasonable compromise.",
        "Higher values assume the lapse was a fluke.",
      ],
      warnings: [
        "Higher values risk repeated lapses if the card wasn't really learned.",
      ],
      relatedSettings: ["study.minimumInterval", "study.leechThreshold"],
    },
    type: "range",
    defaultValue: 0,
    validation: { min: 0, max: 100, step: 5 },
    allowedScopes: ["global", "profile", "deck", "template"],
  },
  {
    key: "study.minimumInterval",
    category: "study",
    subcategory: "Lapses",
    name: "Minimum Interval After Lapse",
    explanation: {
      summary: "Minimum days before reviewing a lapsed card again.",
      detailed:
        "After relearning a forgotten card, the review interval will be at least this many days, regardless of the calculated new interval.",
      impact: "Ensures you don't see lapsed cards again the same day.",
    },
    type: "range",
    defaultValue: 1,
    validation: { min: 1, max: 7, step: 1 },
    allowedScopes: ["global", "profile", "deck", "template"],
  },
  {
    key: "study.leechThreshold",
    category: "study",
    subcategory: "Lapses",
    name: "Leech Threshold",
    explanation: {
      summary: 'Number of lapses before a card is marked as a "leech".',
      detailed:
        "A leech is a card you keep forgetting repeatedly. After this many lapses, the card is flagged so you can take action—perhaps the card needs to be rewritten or broken down.",
      impact:
        "Lower = catch problem cards sooner. Higher = more patience before flagging.",
      tips: [
        "8 is a good default.",
        "Review your leeches periodically and consider rewriting them.",
      ],
      relatedSettings: ["study.leechAction"],
    },
    type: "range",
    defaultValue: 8,
    validation: { min: 3, max: 20, step: 1 },
    allowedScopes: ["global", "profile", "deck"],
  },
  {
    key: "study.leechAction",
    category: "study",
    subcategory: "Lapses",
    name: "Leech Action",
    explanation: {
      summary: "What to do when a card becomes a leech.",
      detailed:
        "Determines the automatic action taken when a card reaches the leech threshold.",
      impact:
        "Tagging keeps cards in rotation; suspending removes them until you manually unsuspend.",
    },
    type: "enum",
    defaultValue: "tag",
    options: [
      {
        value: "tag",
        label: "Tag Only",
        description: 'Add a "leech" tag but keep reviewing the card.', // Provided value
        useCase: "You want to track leeches but keep reviewing them.",
        tradeoffs: "You'll keep seeing cards that are clearly not sticking.",
      },
      {
        value: "suspend",
        label: "Tag and Suspend",
        description: 'Add a "leech" tag and suspend the card from reviews.',
        useCase: "Focus your time on cards that are working.",
        tradeoffs: "You might forget to unsuspend and review leeches.",
      },
    ],
    allowedScopes: ["global", "profile", "deck"],
  },

  // === Scheduling Algorithm ===
  {
    key: "study.schedulerType",
    category: "study",
    subcategory: "Scheduler",
    name: "Scheduling Algorithm",
    explanation: {
      summary: "The spaced repetition algorithm used to schedule reviews.",
      detailed:
        "Different algorithms use different methods to calculate when you should next see a card. FSRS is the most modern and accurate.",
      impact:
        "Affects review timing, workload distribution, and long-term retention.",
      tips: [
        "FSRS is recommended for most users—it adapts to your personal learning patterns.",
        "SM2 is the classic algorithm used by early Anki.",
        "HLR is research-oriented with more granular decay modeling.",
      ],
      warnings: [
        "Changing algorithms may cause temporary disruption in scheduling.",
        "Algorithm changes apply to future reviews, not past data.",
      ],
    },
    type: "enum",
    defaultValue: "fsrs",
    options: [
      {
        value: "fsrs",
        label: "FSRS (Free Spaced Repetition Scheduler)",
        description:
          "Modern, adaptive algorithm that learns your memory patterns.",
        useCase: "Best for most users. Highly accurate and efficient.",
        tradeoffs: "Requires some reviews to calibrate to your patterns.",
      },
      {
        value: "sm2",
        label: "SM2 (SuperMemo 2)",
        description:
          "Classic algorithm used by early spaced repetition systems.",
        useCase: "Familiar if you've used Anki or SuperMemo before.",
        tradeoffs: "Less accurate than FSRS, doesn't adapt to your patterns.",
      },
      {
        value: "hlr",
        label: "HLR (Half-Life Regression)",
        description:
          "Research algorithm with sophisticated memory decay modeling.",
        useCase: "For users interested in memory science.",
        tradeoffs: "May be overkill for casual learners.",
      },
    ],
    allowedScopes: ["global", "profile"],
    requiresRestart: false,
  },
  {
    key: "study.fsrsParameters.requestRetention",
    category: "study",
    subcategory: "Scheduler",
    name: "Target Retention",
    explanation: {
      summary:
        "The probability of recalling a card correctly at review time (0.7-0.99).",
      detailed:
        "This is the target accuracy rate the algorithm aims for. Higher values mean more frequent reviews but better retention. Lower values mean fewer reviews but more forgotten cards.",
      impact:
        "0.90 (90%) is balanced. 0.95 is high-retention (more work). 0.80 is efficiency-focused (more forgetting).",
      tips: [
        "0.90 is the sweet spot for most learners.",
        "Use 0.95+ for mission-critical material.",
        "Use 0.80-0.85 if you prefer efficiency over perfection.",
      ],
      warnings: [
        "Very high retention (0.97+) dramatically increases workload.",
        "Very low retention (below 0.80) means you'll forget a lot.",
      ],
    },
    type: "range",
    defaultValue: 0.9,
    validation: { min: 0.7, max: 0.99, step: 0.01 },
    allowedScopes: ["global", "profile", "deck"],
  },
  {
    key: "study.enableFuzz",
    category: "study",
    subcategory: "Scheduler",
    name: "Enable Interval Fuzz",
    explanation: {
      summary: "Add small random variations to review intervals.",
      detailed:
        "Fuzzing adds a small random amount to intervals so cards don't all come due on the same day. This smooths out your workload.",
      impact:
        "Prevents review clustering; makes daily workload more predictable.",
      tips: ["Keep this enabled unless you have a specific reason not to."],
    },
    type: "boolean",
    defaultValue: true,
    allowedScopes: ["global", "profile"],
  },
  {
    key: "study.fuzzFactor",
    category: "study",
    subcategory: "Scheduler",
    name: "Fuzz Amount",
    explanation: {
      summary: "Maximum percentage variation added to intervals.",
      detailed:
        "A fuzz factor of 5% means intervals can vary by up to ±5%. Higher values spread cards out more; lower values keep them closer to calculated intervals.",
      impact:
        "Higher = more spread, smoother workload. Lower = more precise scheduling.",
    },
    type: "range",
    defaultValue: 5,
    validation: { min: 0, max: 25, step: 1 },
    allowedScopes: ["global", "profile"],
  },
]; // Properly closed the array

// =============================================================================
// DISPLAY SETTINGS METADATA
// =============================================================================

export const DISPLAY_SETTINGS_METADATA: SettingMetadata<
  DisplaySettings[keyof DisplaySettings]
>[] = [
  // === Theme ===
  {
    key: "display.theme",
    category: "display",
    subcategory: "Theme",
    name: "Color Theme",
    explanation: {
      summary: "Choose between light, dark, or system-based theme.",
      detailed:
        'Controls the overall color scheme of the app. "System" follows your device\'s dark mode setting.',
      impact:
        "Affects visual comfort, especially in different lighting conditions.",
      tips: [
        "Dark mode is easier on eyes in low light.",
        "Light mode may be better for outdoor use.",
        "System mode adapts automatically.",
      ],
    },
    type: "enum",
    defaultValue: "system",
    options: [
      {
        value: "light",
        label: "Light",
        description: "Light background with dark text.",
        useCase: "Best for bright environments and daytime use.",
      },
      {
        value: "dark",
        label: "Dark",
        description: "Dark background with light text.",
        useCase: "Best for low-light environments to reduce eye strain.",
        tradeoffs: "May be harder to read in bright sunlight.",
      },
      {
        value: "system",
        label: "System",
        description: "Follows your device's theme setting.",
        useCase: "Automatically adapts to your preferences.",
      },
    ],
    allowedScopes: ["global", "profile", "device"],
  },
  {
    key: "display.accentColor",
    category: "display",
    subcategory: "Theme",
    name: "Accent Color",
    explanation: {
      summary:
        "Primary color used for buttons, highlights, and interactive elements.",
      detailed:
        "Choose a color that you find pleasant and easy to distinguish. This color is used throughout the app for primary actions and focus states.",
      impact: "Affects the visual personality of the app.",
    },
    type: "color",
    defaultValue: "#6366f1",
    allowedScopes: ["global", "profile", "device"],
  },
  {
    key: "display.trueBlack",
    category: "display",
    subcategory: "Theme",
    name: "True Black (OLED)",
    explanation: {
      summary: "Use pure black background in dark mode.",
      detailed:
        "On OLED screens, true black (#000000) turns off pixels completely, saving battery. On LCD screens, this has no battery benefit but some prefer the look.",
      impact: "Battery savings on OLED devices. Higher contrast.",
      tips: ["Enable if you have an OLED screen and want to save battery."],
    },
    type: "boolean",
    defaultValue: false,
    allowedScopes: ["global", "profile", "device"],
  },

  // === Typography ===
  {
    key: "display.fontSize",
    category: "display",
    subcategory: "Typography",
    name: "Font Size",
    explanation: {
      summary: "Base text size throughout the app.",
      detailed:
        "Adjusts the font size for all text in the app. Card content may have its own scaling.",
      impact: "Larger text is easier to read but shows less content at once.",
    },
    type: "enum",
    defaultValue: "medium",
    options: [
      {
        value: "small",
        label: "Small",
        description: "Compact text, fits more content.",
      },
      {
        value: "medium",
        label: "Medium",
        description: "Default size, balanced readability.",
      },
      {
        value: "large",
        label: "Large",
        description: "Larger text, easier to read.",
      },
      {
        value: "xlarge",
        label: "Extra Large",
        description: "Very large text for accessibility.",
      },
    ],
    allowedScopes: ["global", "profile", "device"],
  },
  {
    key: "display.fontFamily",
    category: "display",
    subcategory: "Typography",
    name: "Font Family",
    explanation: {
      summary: "Typeface used for card content.",
      detailed:
        "Choose a font family that suits your content. System fonts are optimized for your device; serif fonts are traditional; monospace is good for code.",
      impact: "Affects readability and visual style of cards.",
    },
    type: "enum",
    defaultValue: "system",
    options: [
      {
        value: "system",
        label: "System Default",
        description: "Uses your device's default font.",
      },
      {
        value: "serif",
        label: "Serif",
        description: "Traditional style with decorative strokes (e.g., Times).",
      },
      {
        value: "sans-serif",
        label: "Sans Serif",
        description: "Clean, modern style without strokes (e.g., Helvetica).",
      },
      {
        value: "monospace",
        label: "Monospace",
        description: "Fixed-width characters, good for code.",
      },
    ],
    allowedScopes: ["global", "profile", "deck", "template"],
  },
  {
    key: "display.lineHeight",
    category: "display",
    subcategory: "Typography",
    name: "Line Height",
    explanation: {
      summary: "Spacing between lines of text.",
      detailed:
        "Higher line height makes text easier to read but takes more space. Lower line height is more compact.",
      impact: "Affects readability of multi-line card content.",
    },
    type: "range",
    defaultValue: 1.5,
    validation: { min: 1.0, max: 2.0, step: 0.1 },
    allowedScopes: ["global", "profile", "device"],
  },

  // === Card Display ===
  {
    key: "display.showCardTags",
    category: "display",
    subcategory: "Card Display",
    name: "Show Card Tags",
    explanation: {
      summary: "Display tags on cards during review.",
      detailed:
        "Tags appear as small labels on cards, helping you identify topics or categories.",
      impact: "Provides context but adds visual clutter.",
    },
    type: "boolean",
    defaultValue: true,
    allowedScopes: ["global", "profile", "deck"],
  },
  {
    key: "display.showDeckName",
    category: "display",
    subcategory: "Card Display",
    name: "Show Deck Name",
    explanation: {
      summary: "Display the deck name on cards.",
      detailed:
        "Shows which deck a card belongs to. Useful when studying multiple decks at once.",
      impact:
        "Provides context but may give hints if deck names are descriptive.",
    },
    type: "boolean",
    defaultValue: true,
    allowedScopes: ["global", "profile"],
  },
  {
    key: "display.showCardType",
    category: "display",
    subcategory: "Card Display",
    name: "Show Card Type",
    explanation: {
      summary: "Display the card type indicator (Basic, Cloze, etc.).",
      detailed:
        "Shows what type of card you're reviewing. Useful for decks with mixed card types.",
      impact: "Minimal visual addition, helps identify card format.",
    },
    type: "boolean",
    defaultValue: false,
    allowedScopes: ["global", "profile"],
  },
  {
    key: "display.showNextReviewTime",
    category: "display",
    subcategory: "Card Display",
    name: "Show Next Review Time",
    explanation: {
      summary: "Display when you'll see the card again after answering.",
      detailed:
        "After rating a card, briefly shows the calculated next review time.",
      impact: "Provides feedback on scheduling but may be distracting.",
    },
    type: "boolean",
    defaultValue: true,
    allowedScopes: ["global", "profile"],
  },
  {
    key: "display.showButtonTimes",
    category: "display",
    subcategory: "Card Display",
    name: "Show Button Times",
    explanation: {
      summary: "Display interval predictions on answer buttons.",
      detailed:
        'Shows estimated intervals (e.g., "10m", "1d", "4d") on the Again/Hard/Good/Easy buttons.',
      impact:
        "Helps make informed rating decisions but adds visual complexity.",
      tips: [
        "Recommended for learning how the algorithm works.",
        "Can be disabled once you're comfortable with rating.",
      ],
    },
    type: "boolean",
    defaultValue: true,
    allowedScopes: ["global", "profile"],
  },
  {
    key: "display.showRemainingCount",
    category: "display",
    subcategory: "Card Display",
    name: "Show Remaining Card Count",
    explanation: {
      summary: "Display how many cards are left in the session.",
      detailed: "Shows the count of remaining new, learning, and review cards.",
      impact:
        "Provides progress feedback but may create anxiety about card count.",
    },
    type: "boolean",
    defaultValue: true,
    allowedScopes: ["global", "profile"],
  },
  {
    key: "display.centerCardContent",
    category: "display",
    subcategory: "Card Display",
    name: "Center Card Content",
    explanation: {
      summary: "Center card content vertically on screen.",
      detailed:
        "When enabled, card content is centered in the available space. When disabled, content starts from the top.",
      impact: "Visual preference; centered may be easier to focus on.",
    },
    type: "boolean",
    defaultValue: true,
    allowedScopes: ["global", "profile", "device"],
  },

  // === Animations ===
  {
    key: "display.cardAnimation",
    category: "display",
    subcategory: "Animations",
    name: "Card Animation",
    explanation: {
      summary: "Animation style when flipping or transitioning cards.",
      detailed:
        "Choose how cards animate when you flip them or move to the next card.",
      impact: 'Visual preference; "None" is fastest.',
    },
    type: "enum",
    defaultValue: "flip",
    options: [
      {
        value: "flip",
        label: "Flip",
        description: "Card flips over like a real card.",
      },
      {
        value: "slide",
        label: "Slide",
        description: "Card slides to reveal the answer.",
      },
      {
        value: "fade",
        label: "Fade",
        description: "Card fades between front and back.",
      },
      {
        value: "none",
        label: "None",
        description: "Instant switch, no animation.",
      },
    ],
    allowedScopes: ["global", "profile", "device"],
  },
  {
    key: "display.animationsEnabled",
    category: "display",
    subcategory: "Animations",
    name: "Enable Animations",
    explanation: {
      summary: "Enable UI animations throughout the app.",
      detailed:
        "Controls all non-essential animations. Disabling can improve performance and reduce motion sickness.",
      impact: "Disabling makes the app feel snappier but less polished.",
      relatedSettings: ["accessibility.reduceMotion"],
    },
    type: "boolean",
    defaultValue: true,
    allowedScopes: ["global", "profile", "device"],
  },
  {
    key: "display.animationSpeed",
    category: "display",
    subcategory: "Animations",
    name: "Animation Speed",
    explanation: {
      summary: "Speed multiplier for animations.",
      detailed:
        "Values below 1.0 slow animations down; values above 1.0 speed them up.",
      impact:
        "Slower animations are easier to follow; faster animations save time.",
    },
    type: "range",
    defaultValue: 1.0,
    validation: { min: 0.5, max: 2.0, step: 0.1 },
    allowedScopes: ["global", "profile", "device"],
  },
];

// =============================================================================
// AUDIO SETTINGS METADATA
// =============================================================================

import type { AudioSettings } from "./settings.types";

export const AUDIO_SETTINGS_METADATA: SettingMetadata<
  AudioSettings[keyof AudioSettings]
>[] = [
  // === Sound Effects ===
  {
    key: "audio.soundEnabled",
    category: "audio",
    subcategory: "Sound Effects",
    name: "Enable Sounds",
    explanation: {
      summary: "Play sound effects during study sessions.",
      detailed:
        "Enables audio feedback for actions like correct/incorrect answers.",
      impact: "Provides auditory feedback but may disturb others nearby.",
    },
    type: "boolean",
    defaultValue: true,
    allowedScopes: ["global", "profile", "device"],
  },
  {
    key: "audio.soundVolume",
    category: "audio",
    subcategory: "Sound Effects",
    name: "Sound Volume",
    explanation: {
      summary: "Volume level for sound effects.",
      detailed: "Controls how loud sound effects are played.",
      impact:
        "Lower volume is less disruptive; higher volume is more noticeable.",
    },
    type: "range",
    defaultValue: 80,
    validation: { min: 0, max: 100, step: 10 },
    allowedScopes: ["global", "profile", "device"],
  },
  {
    key: "audio.correctSound",
    category: "audio",
    subcategory: "Sound Effects",
    name: "Correct Answer Sound",
    explanation: {
      summary: "Sound to play when you answer correctly.",
      detailed: "Choose the audio feedback for successful recall.",
      impact: "Provides positive reinforcement.",
    },
    type: "enum",
    defaultValue: "default",
    options: [
      {
        value: "default",
        label: "Default",
        description: "A pleasant chime sound.",
      },
      {
        value: "subtle",
        label: "Subtle",
        description: "A quiet, unobtrusive sound.",
      },
      {
        value: "celebration",
        label: "Celebration",
        description: "A more rewarding sound.",
      },
      {
        value: "none",
        label: "None",
        description: "No sound for correct answers.",
      },
    ],
    allowedScopes: ["global", "profile"],
  },
  {
    key: "audio.incorrectSound",
    category: "audio",
    subcategory: "Sound Effects",
    name: "Incorrect Answer Sound",
    explanation: {
      summary: "Sound to play when you answer incorrectly.",
      detailed: "Choose the audio feedback for failed recall.",
      impact: "Provides feedback without being discouraging.",
    },
    type: "enum",
    defaultValue: "default",
    options: [
      {
        value: "default",
        label: "Default",
        description: "A neutral feedback sound.",
      },
      {
        value: "subtle",
        label: "Subtle",
        description: "A quiet, unobtrusive sound.",
      },
      {
        value: "none",
        label: "None",
        description: "No sound for incorrect answers.",
      },
    ],
    allowedScopes: ["global", "profile"],
  },
  // === Haptics ===
  {
    key: "audio.hapticsEnabled",
    category: "audio",
    subcategory: "Haptic Feedback",
    name: "Enable Haptics",
    explanation: {
      summary: "Enable vibration feedback for interactions.",
      detailed: "Provides tactile feedback when you tap buttons or flip cards.",
      impact: "Enhances physical feedback but uses battery.",
    },
    type: "boolean",
    defaultValue: true,
    allowedScopes: ["global", "profile", "device"],
  },
  {
    key: "audio.hapticIntensity",
    category: "audio",
    subcategory: "Haptic Feedback",
    name: "Haptic Intensity",
    explanation: {
      summary: "Strength of haptic vibrations.",
      detailed: "Controls how strong the vibration feedback feels.",
      impact: "Stronger feedback is more noticeable but uses more battery.",
    },
    type: "enum",
    defaultValue: "medium",
    options: [
      { value: "light", label: "Light", description: "Subtle vibration." },
      { value: "medium", label: "Medium", description: "Balanced vibration." },
      { value: "heavy", label: "Heavy", description: "Strong vibration." },
    ],
    allowedScopes: ["global", "profile", "device"],
  },
  // === Text-to-Speech ===
  {
    key: "audio.ttsEnabled",
    category: "audio",
    subcategory: "Text-to-Speech",
    name: "Enable Text-to-Speech",
    explanation: {
      summary: "Read card content aloud using text-to-speech.",
      detailed:
        "Useful for language learning or when you want to listen instead of read.",
      impact: "Great for pronunciation practice and auditory learning.",
      tips: ["Essential for language learning.", "Works best with headphones."],
    },
    type: "boolean",
    defaultValue: false,
    allowedScopes: ["global", "profile", "deck", "template"],
  },
  {
    key: "audio.ttsAutoplay",
    category: "audio",
    subcategory: "Text-to-Speech",
    name: "Auto-play TTS",
    explanation: {
      summary: "Automatically read cards when shown.",
      detailed: "When enabled, TTS starts automatically when a card appears.",
      impact: "Hands-free learning but may be distracting.",
    },
    type: "boolean",
    defaultValue: false,
    allowedScopes: ["global", "profile", "deck"],
  },
  {
    key: "audio.ttsSpeed",
    category: "audio",
    subcategory: "Text-to-Speech",
    name: "TTS Speed",
    explanation: {
      summary: "How fast text-to-speech reads content.",
      detailed:
        "Slower speeds are easier to understand; faster speeds save time.",
      impact: "Adjust based on your comprehension level.",
    },
    type: "range",
    defaultValue: 1.0,
    validation: { min: 0.5, max: 2.0, step: 0.1 },
    allowedScopes: ["global", "profile", "deck"],
  },
  {
    key: "audio.ttsVoice",
    category: "audio",
    subcategory: "Text-to-Speech",
    name: "TTS Voice",
    explanation: {
      summary: "Voice to use for text-to-speech.",
      detailed: "Choose from available voices on your device.",
      impact: "Different voices may be clearer for different languages.",
    },
    type: "string",
    defaultValue: "default",
    allowedScopes: ["global", "profile", "deck"],
  },
  {
    key: "audio.ttsReadSide",
    category: "audio",
    subcategory: "Text-to-Speech",
    name: "TTS Read Side",
    explanation: {
      summary: "Which side of the card to read.",
      detailed: "Choose to read the front, back, or both sides of cards.",
      impact: "Reading both sides is useful for full comprehension.",
    },
    type: "enum",
    defaultValue: "front",
    options: [
      {
        value: "front",
        label: "Front Only",
        description: "Read only the question.",
      },
      {
        value: "back",
        label: "Back Only",
        description: "Read only the answer.",
      },
      {
        value: "both",
        label: "Both",
        description: "Read both question and answer.",
      },
    ],
    allowedScopes: ["global", "profile", "deck"],
  },
  // === Audio Cards ===
  {
    key: "audio.autoplayAudio",
    category: "audio",
    subcategory: "Audio Cards",
    name: "Auto-play Audio",
    explanation: {
      summary: "Automatically play audio on audio cards.",
      detailed: "Audio content plays automatically when the card appears.",
      impact: "Convenient but may surprise you in quiet environments.",
    },
    type: "boolean",
    defaultValue: true,
    allowedScopes: ["global", "profile", "deck"],
  },
  {
    key: "audio.autoplaySpeed",
    category: "audio",
    subcategory: "Audio Cards",
    name: "Auto-play Speed",
    explanation: {
      summary: "Playback speed for audio content.",
      detailed: "Speed up or slow down audio playback.",
      impact: "Faster saves time; slower aids comprehension.",
    },
    type: "enum",
    defaultValue: "normal",
    options: [
      {
        value: "slow",
        label: "Slow (0.75x)",
        description: "Slower playback for comprehension.",
      },
      {
        value: "normal",
        label: "Normal (1x)",
        description: "Regular playback speed.",
      },
      {
        value: "fast",
        label: "Fast (1.5x)",
        description: "Faster playback to save time.",
      },
    ],
    allowedScopes: ["global", "profile", "deck"],
  },
];

// =============================================================================
// NOTIFICATION SETTINGS METADATA
// =============================================================================

import type { NotificationSettings } from "./settings.types";

export const NOTIFICATION_SETTINGS_METADATA: SettingMetadata<
  NotificationSettings[keyof NotificationSettings]
>[] = [
  {
    key: "notifications.pushEnabled",
    category: "notifications",
    subcategory: "Push Notifications",
    name: "Enable Push Notifications",
    explanation: {
      summary: "Receive push notifications from the app.",
      detailed: "Master switch for all push notifications.",
      impact: "Disabling prevents any reminders or alerts.",
    },
    type: "boolean",
    defaultValue: true,
    allowedScopes: ["global", "device"],
  },
  {
    key: "notifications.dailyReminderEnabled",
    category: "notifications",
    subcategory: "Daily Reminder",
    name: "Daily Study Reminder",
    explanation: {
      summary: "Get a daily reminder to study.",
      detailed:
        "Sends a notification at your chosen time to remind you to study.",
      impact: "Helps build a consistent study habit.",
      tips: ["Set it for when you usually have free time."],
    },
    type: "boolean",
    defaultValue: true,
    allowedScopes: ["global", "profile"],
  },
  {
    key: "notifications.dailyReminderTime",
    category: "notifications",
    subcategory: "Daily Reminder",
    name: "Reminder Time",
    explanation: {
      summary: "Time to receive your daily reminder.",
      detailed: "The notification will be sent at this time each day.",
      impact: "Choose a time when you can actually study.",
    },
    type: "time",
    defaultValue: "09:00",
    allowedScopes: ["global", "profile", "device"],
  },
  {
    key: "notifications.skipIfStudied",
    category: "notifications",
    subcategory: "Daily Reminder",
    name: "Skip If Already Studied",
    explanation: {
      summary: "Don't send reminder if you've already studied today.",
      detailed:
        "Prevents unnecessary reminders when you've completed your daily goal.",
      impact: "Reduces notification fatigue.",
    },
    type: "boolean",
    defaultValue: true,
    allowedScopes: ["global", "profile"],
  },
  {
    key: "notifications.streakReminderEnabled",
    category: "notifications",
    subcategory: "Streak Notifications",
    name: "Streak Reminder",
    explanation: {
      summary: "Get warned before your streak is about to break.",
      detailed:
        "Sends a reminder hours before midnight if you haven't studied.",
      impact: "Helps protect your learning streak.",
    },
    type: "boolean",
    defaultValue: true,
    allowedScopes: ["global", "profile"],
  },
  {
    key: "notifications.streakWarningHours",
    category: "notifications",
    subcategory: "Streak Notifications",
    name: "Streak Warning Hours",
    explanation: {
      summary: "Hours before midnight to send streak warning.",
      detailed: "How early to warn you about a potential streak break.",
      impact: "Earlier warnings give more time to study.",
    },
    type: "range",
    defaultValue: 4,
    validation: { min: 1, max: 12, step: 1 },
    allowedScopes: ["global", "profile"],
  },
  {
    key: "notifications.achievementNotifications",
    category: "notifications",
    subcategory: "Achievements",
    name: "Achievement Notifications",
    explanation: {
      summary: "Get notified when you unlock achievements.",
      detailed: "Celebrate your progress with achievement alerts.",
      impact: "Provides positive reinforcement.",
    },
    type: "boolean",
    defaultValue: true,
    allowedScopes: ["global", "profile"],
  },
  {
    key: "notifications.weeklySummaryEnabled",
    category: "notifications",
    subcategory: "Weekly Summary",
    name: "Weekly Summary",
    explanation: {
      summary: "Receive a weekly summary of your learning progress.",
      detailed: "Get insights on cards studied, retention rate, and progress.",
      impact: "Helps track long-term progress.",
    },
    type: "boolean",
    defaultValue: true,
    allowedScopes: ["global", "profile"],
  },
];

// =============================================================================
// PRIVACY SETTINGS METADATA
// =============================================================================

import type { PrivacySettings } from "./settings.types";

export const PRIVACY_SETTINGS_METADATA: SettingMetadata<
  PrivacySettings[keyof PrivacySettings]
>[] = [
  {
    key: "privacy.analyticsEnabled",
    category: "privacy",
    subcategory: "Analytics",
    name: "Usage Analytics",
    explanation: {
      summary: "Allow anonymous usage data collection.",
      detailed: "Helps us understand how the app is used to improve it.",
      impact: "Your data helps make the app better for everyone.",
      tips: ["Data is anonymized and never sold."],
    },
    type: "boolean",
    defaultValue: true,
    isPrivacySensitive: true,
    allowedScopes: ["global"],
  },
  {
    key: "privacy.crashReportingEnabled",
    category: "privacy",
    subcategory: "Analytics",
    name: "Crash Reporting",
    explanation: {
      summary: "Automatically report app crashes.",
      detailed: "When the app crashes, send a report to help us fix it.",
      impact: "Helps us fix bugs faster.",
      warnings: ["Disabling makes it harder to fix issues you encounter."],
    },
    type: "boolean",
    defaultValue: true,
    isPrivacySensitive: true,
    allowedScopes: ["global"],
  },
  {
    key: "privacy.shareStudyStats",
    category: "privacy",
    subcategory: "Data Sharing",
    name: "Share Study Stats",
    explanation: {
      summary: "Share your study statistics for leaderboards.",
      detailed: "Allows your progress to appear on public leaderboards.",
      impact: "Enables friendly competition but exposes your activity.",
    },
    type: "boolean",
    defaultValue: false,
    isPrivacySensitive: true,
    allowedScopes: ["global", "profile"],
  },
  {
    key: "privacy.showOnLeaderboard",
    category: "privacy",
    subcategory: "Data Sharing",
    name: "Show on Leaderboard",
    explanation: {
      summary: "Appear on public leaderboards.",
      detailed: "Your username and stats will be visible to other users.",
      impact: "Public visibility but motivates through competition.",
    },
    type: "boolean",
    defaultValue: true,
    isPrivacySensitive: true,
    allowedScopes: ["global", "profile"],
  },
  {
    key: "privacy.profilePublic",
    category: "privacy",
    subcategory: "Profile Visibility",
    name: "Public Profile",
    explanation: {
      summary: "Make your profile visible to other users.",
      detailed: "Others can see your profile, achievements, and stats.",
      impact: "Enables social features but reduces privacy.",
    },
    type: "boolean",
    defaultValue: false,
    isPrivacySensitive: true,
    allowedScopes: ["global", "profile"],
  },
  {
    key: "privacy.reviewHistoryRetention",
    category: "privacy",
    subcategory: "Data Retention",
    name: "Review History Retention",
    explanation: {
      summary: "Days to keep detailed review history.",
      detailed: "Older review data is automatically deleted.",
      impact:
        "Longer retention provides better analytics but uses more storage.",
    },
    type: "range",
    defaultValue: 365,
    validation: { min: 30, max: 365, step: 30 },
    isPrivacySensitive: true,
    allowedScopes: ["global"],
  },
];

// =============================================================================
// SYNC SETTINGS METADATA
// =============================================================================

import type { SyncSettings } from "./settings.types";

export const SYNC_SETTINGS_METADATA: SettingMetadata<
  SyncSettings[keyof SyncSettings]
>[] = [
  {
    key: "sync.autoSyncEnabled",
    category: "sync",
    subcategory: "Auto Sync",
    name: "Auto Sync",
    explanation: {
      summary: "Automatically sync data with the cloud.",
      detailed: "Changes are uploaded and downloaded automatically.",
      impact: "Keeps all devices up to date.",
    },
    type: "boolean",
    defaultValue: true,
    allowedScopes: ["global", "device"],
  },
  {
    key: "sync.syncOnWifiOnly",
    category: "sync",
    subcategory: "Auto Sync",
    name: "Sync on Wi-Fi Only",
    explanation: {
      summary: "Only sync when connected to Wi-Fi.",
      detailed: "Prevents sync from using mobile data.",
      impact: "Saves mobile data but may delay sync.",
    },
    type: "boolean",
    defaultValue: false,
    allowedScopes: ["global", "device"],
  },
  {
    key: "sync.conflictResolution",
    category: "sync",
    subcategory: "Conflict Resolution",
    name: "Conflict Resolution",
    explanation: {
      summary: "How to handle conflicts between devices.",
      detailed:
        "When the same setting is changed on multiple devices, this determines which value wins.",
      impact: "Important for maintaining consistency across devices.",
      tips: ['"Ask" is safest but requires manual intervention.'],
      warnings: [
        "Automatic resolution may overwrite changes you want to keep.",
      ],
    },
    type: "enum",
    defaultValue: "ask",
    options: [
      {
        value: "ask",
        label: "Ask Me",
        description: "Prompt for each conflict (recommended).",
      },
      {
        value: "server",
        label: "Server Wins",
        description: "Always use the server version.",
      },
      {
        value: "local",
        label: "Local Wins",
        description: "Always keep the local version.",
      },
      {
        value: "newest",
        label: "Newest Wins",
        description: "Keep the most recent change.",
      },
    ],
    allowedScopes: ["global"],
  },
  {
    key: "sync.offlineModeEnabled",
    category: "sync",
    subcategory: "Offline Mode",
    name: "Offline Mode",
    explanation: {
      summary: "Enable offline studying capabilities.",
      detailed: "Download data for studying without internet connection.",
      impact: "Study anywhere but uses device storage.",
    },
    type: "boolean",
    defaultValue: true,
    allowedScopes: ["global", "device"],
  },
  {
    key: "sync.maxOfflineStorage",
    category: "sync",
    subcategory: "Offline Mode",
    name: "Max Offline Storage",
    explanation: {
      summary: "Maximum storage for offline content (MB).",
      detailed: "Limits how much content is downloaded for offline use.",
      impact: "Higher values allow more offline content but use more storage.",
    },
    type: "range",
    defaultValue: 500,
    validation: { min: 100, max: 2000, step: 100 },
    allowedScopes: ["global", "device"],
  },
  {
    key: "sync.autoBackupEnabled",
    category: "sync",
    subcategory: "Backup",
    name: "Auto Backup",
    explanation: {
      summary: "Automatically back up your data.",
      detailed: "Creates periodic backups of your entire library.",
      impact: "Protects against data loss.",
      tips: ["Keep this enabled for peace of mind."],
    },
    type: "boolean",
    defaultValue: true,
    allowedScopes: ["global"],
  },
  {
    key: "sync.backupsToKeep",
    category: "sync",
    subcategory: "Backup",
    name: "Backups to Keep",
    explanation: {
      summary: "Number of backup copies to retain.",
      detailed: "Older backups are deleted when this limit is reached.",
      impact:
        "More backups provide better recovery options but use more storage.",
    },
    type: "range",
    defaultValue: 5,
    validation: { min: 1, max: 10, step: 1 },
    allowedScopes: ["global"],
  },
];

// =============================================================================
// ACCESSIBILITY SETTINGS METADATA
// =============================================================================

import type { AccessibilitySettings } from "./settings.types";

export const ACCESSIBILITY_SETTINGS_METADATA: SettingMetadata<
  AccessibilitySettings[keyof AccessibilitySettings]
>[] = [
  {
    key: "accessibility.highContrast",
    category: "accessibility",
    subcategory: "Visual",
    name: "High Contrast",
    explanation: {
      summary: "Increase contrast for better visibility.",
      detailed: "Makes text and UI elements more distinguishable.",
      impact: "Improves readability for users with visual impairments.",
    },
    type: "boolean",
    defaultValue: false,
    allowedScopes: ["global", "profile", "device"],
  },
  {
    key: "accessibility.largeText",
    category: "accessibility",
    subcategory: "Visual",
    name: "Large Text",
    explanation: {
      summary: "Use larger text throughout the app.",
      detailed: "Increases all text sizes for better readability.",
      impact: "Easier to read but shows less content per screen.",
    },
    type: "boolean",
    defaultValue: false,
    allowedScopes: ["global", "profile", "device"],
  },
  {
    key: "accessibility.boldText",
    category: "accessibility",
    subcategory: "Visual",
    name: "Bold Text",
    explanation: {
      summary: "Use bold text for better readability.",
      detailed: "Makes text thicker and easier to read.",
      impact: "Improves readability without changing size.",
    },
    type: "boolean",
    defaultValue: false,
    allowedScopes: ["global", "profile", "device"],
  },
  {
    key: "accessibility.reduceMotion",
    category: "accessibility",
    subcategory: "Motion",
    name: "Reduce Motion",
    explanation: {
      summary: "Minimize animations and motion effects.",
      detailed: "Reduces or eliminates animations throughout the app.",
      impact: "Helps users sensitive to motion.",
      tips: ["Enable if animations cause discomfort."],
    },
    type: "boolean",
    defaultValue: false,
    allowedScopes: ["global", "profile", "device"],
  },
  {
    key: "accessibility.tapToFlip",
    category: "accessibility",
    subcategory: "Interaction",
    name: "Tap to Flip",
    explanation: {
      summary: "Tap anywhere on card to flip.",
      detailed:
        "Instead of requiring a button press, tap the card to reveal the answer.",
      impact: "Faster interaction but may cause accidental flips.",
    },
    type: "boolean",
    defaultValue: true,
    allowedScopes: ["global", "profile"],
  },
  {
    key: "accessibility.swipeToRate",
    category: "accessibility",
    subcategory: "Interaction",
    name: "Swipe to Rate",
    explanation: {
      summary: "Swipe left/right to rate cards.",
      detailed: "Use swipe gestures instead of buttons to rate cards.",
      impact: "Faster reviewing once you get used to it.",
    },
    type: "boolean",
    defaultValue: true,
    allowedScopes: ["global", "profile"],
  },
  {
    key: "accessibility.screenReaderOptimized",
    category: "accessibility",
    subcategory: "Screen Reader",
    name: "Screen Reader Optimized",
    explanation: {
      summary: "Optimize the app for screen readers.",
      detailed: "Improves compatibility with VoiceOver, TalkBack, etc.",
      impact: "Essential for users who rely on screen readers.",
    },
    type: "boolean",
    defaultValue: false,
    allowedScopes: ["global", "device"],
  },
];

// =============================================================================
// AI SETTINGS METADATA
// =============================================================================

import type { AISettings } from "./settings.types";

export const AI_SETTINGS_METADATA: SettingMetadata<
  AISettings[keyof AISettings]
>[] = [
  {
    key: "ai.aiEnabled",
    category: "ai",
    subcategory: "Master Switch",
    name: "Enable AI Features",
    explanation: {
      summary: "Master switch for all AI-powered features.",
      detailed:
        "AI features can help optimize your learning through personalized suggestions. ALL AI FEATURES ARE OPT-IN.",
      impact:
        "Enables AI assistance but requires sending some data to our servers.",
      warnings: [
        "AI features require network connectivity.",
        "Some data will be sent to our servers for processing.",
      ],
    },
    type: "boolean",
    defaultValue: false,
    isAIFeature: true,
    allowedScopes: ["global"],
  },
  {
    key: "ai.aiTermsAccepted",
    category: "ai",
    subcategory: "Master Switch",
    name: "AI Terms Accepted",
    explanation: {
      summary: "Acknowledge AI terms and data processing.",
      detailed: "You must accept the AI terms before enabling AI features.",
      impact: "Required for using AI features.",
    },
    type: "boolean",
    defaultValue: false,
    isAIFeature: true,
    allowedScopes: ["global"],
  },
  {
    key: "ai.aiCardSuggestions",
    category: "ai",
    subcategory: "Card Generation",
    name: "AI Card Suggestions",
    explanation: {
      summary: "Allow AI to suggest new cards.",
      detailed: "AI analyzes your content and suggests cards to create.",
      impact: "Speeds up card creation but suggestions need review.",
      tips: ["Always review AI suggestions before accepting."],
    },
    type: "boolean",
    defaultValue: false,
    isAIFeature: true,
    allowedScopes: ["global", "profile", "deck"],
  },
  {
    key: "ai.requireApprovalForAIChanges",
    category: "ai",
    subcategory: "Safety",
    name: "Require Approval for AI Changes",
    explanation: {
      summary: "AI changes require your approval before applying.",
      detailed: "When enabled, AI suggestions must be explicitly approved.",
      impact: "Prevents unwanted automatic changes.",
      warnings: ["Disabling allows AI to make changes without confirmation."],
    },
    type: "boolean",
    defaultValue: true,
    isAIFeature: true,
    allowedScopes: ["global"],
  },
  {
    key: "ai.aiScheduleOptimization",
    category: "ai",
    subcategory: "Study Optimization",
    name: "AI Schedule Optimization",
    explanation: {
      summary: "Allow AI to optimize your study schedule.",
      detailed: "AI analyzes your performance to suggest optimal review times.",
      impact: "May improve retention by optimizing timing.",
    },
    type: "boolean",
    defaultValue: false,
    isAIFeature: true,
    allowedScopes: ["global", "profile"],
  },
  {
    key: "ai.sendContentToAI",
    category: "ai",
    subcategory: "Data & Privacy",
    name: "Send Card Content to AI",
    explanation: {
      summary: "Allow sending card content to AI for analysis.",
      detailed: "Required for AI features that analyze your cards.",
      impact: "Enables content-based AI features.",
      warnings: ["Your card content will be processed by our AI servers."],
    },
    type: "boolean",
    defaultValue: false,
    isAIFeature: true,
    isPrivacySensitive: true,
    allowedScopes: ["global"],
  },
];

// =============================================================================
// ADVANCED SETTINGS METADATA
// =============================================================================

import type { AdvancedSettings } from "./settings.types";

export const ADVANCED_SETTINGS_METADATA: SettingMetadata<
  AdvancedSettings[keyof AdvancedSettings]
>[] = [
  {
    key: "advanced.debugMode",
    category: "advanced",
    subcategory: "Developer Options",
    name: "Debug Mode",
    explanation: {
      summary: "Enable debug information and logging.",
      detailed: "Shows extra technical information useful for troubleshooting.",
      impact: "Helpful for reporting issues but may slow the app.",
      warnings: ["May affect performance."],
    },
    type: "boolean",
    defaultValue: false,
    allowedScopes: ["global", "device"],
  },
  {
    key: "advanced.showCardIds",
    category: "advanced",
    subcategory: "Developer Options",
    name: "Show Card IDs",
    explanation: {
      summary: "Display card IDs in the interface.",
      detailed: "Shows technical card identifiers for debugging.",
      impact: "Useful for troubleshooting specific cards.",
    },
    type: "boolean",
    defaultValue: false,
    allowedScopes: ["global"],
  },
  {
    key: "advanced.experimentalFeatures",
    category: "advanced",
    subcategory: "Experimental",
    name: "Experimental Features",
    explanation: {
      summary: "Enable experimental features.",
      detailed: "Access features still in development.",
      impact: "Try new features early but they may be unstable.",
      warnings: [
        "Experimental features may change or be removed.",
        "May cause unexpected behavior.",
      ],
    },
    type: "boolean",
    defaultValue: false,
    allowedScopes: ["global"],
  },
  {
    key: "advanced.cacheSize",
    category: "advanced",
    subcategory: "Data Management",
    name: "Cache Size",
    explanation: {
      summary: "Maximum cache storage in MB.",
      detailed: "Limits how much data is cached locally.",
      impact: "Larger cache improves performance but uses more storage.",
    },
    type: "range",
    defaultValue: 100,
    validation: { min: 50, max: 500, step: 50 },
    allowedScopes: ["global", "device"],
  },
  {
    key: "advanced.defaultExportFormat",
    category: "advanced",
    subcategory: "Import/Export",
    name: "Default Export Format",
    explanation: {
      summary: "Default format for exporting data.",
      detailed: "Choose the format used when exporting decks or data.",
      impact:
        "JSON is most complete; CSV is spreadsheet-compatible; Anki format works with Anki.",
    },
    type: "enum",
    defaultValue: "json",
    options: [
      {
        value: "json",
        label: "JSON",
        description: "Complete export, includes all metadata.",
      },
      {
        value: "csv",
        label: "CSV",
        description: "Spreadsheet-compatible, basic fields only.",
      },
      {
        value: "anki",
        label: "Anki",
        description: "Compatible with Anki flashcard app.",
      },
    ],
    allowedScopes: ["global"],
  },
  {
    key: "advanced.includeMediaInExport",
    category: "advanced",
    subcategory: "Import/Export",
    name: "Include Media in Export",
    explanation: {
      summary: "Include images and audio in exports.",
      detailed: "When exporting, include all media files.",
      impact: "Complete exports but larger file sizes.",
    },
    type: "boolean",
    defaultValue: true,
    allowedScopes: ["global"],
  },
];

// =============================================================================
// KEYED METADATA OBJECTS
// =============================================================================
// These provide easy access to metadata by setting key for UI components.
// Usage: STUDY_METADATA.dailyGoal.explanation

type StudySettingKey = keyof StudySettings;
type DisplaySettingKey = keyof DisplaySettings;
type AudioSettingKey = keyof AudioSettings;
type NotificationSettingKey = keyof NotificationSettings;
type PrivacySettingKey = keyof PrivacySettings;
type SyncSettingKey = keyof SyncSettings;
type AccessibilitySettingKey = keyof AccessibilitySettings;
type AISettingKey = keyof AISettings;
type AdvancedSettingKey = keyof AdvancedSettings;

/**
 * Helper to create a keyed object from metadata array.
 */
function createKeyedMetadata<T extends string>(
  metadata: SettingMetadata<unknown>[],
  prefix: string,
): Record<T, SettingMetadata<unknown>> {
  const result = {} as Record<T, SettingMetadata<unknown>>;
  for (const item of metadata) {
    // Extract the key after the prefix (e.g., 'study.dailyGoal' → 'dailyGoal')
    const shortKey = item.key.replace(`${prefix}.`, "") as T;
    result[shortKey] = item;
  }
  return result;
}

/** Keyed study settings metadata for easy access */
export const STUDY_METADATA = createKeyedMetadata<StudySettingKey>(
  STUDY_SETTINGS_METADATA,
  "study",
);

/** Keyed display settings metadata for easy access */
export const DISPLAY_METADATA = createKeyedMetadata<DisplaySettingKey>(
  DISPLAY_SETTINGS_METADATA,
  "display",
);

/** Keyed audio settings metadata for easy access */
export const AUDIO_METADATA = createKeyedMetadata<AudioSettingKey>(
  AUDIO_SETTINGS_METADATA,
  "audio",
);

/** Keyed notification settings metadata for easy access */
export const NOTIFICATION_METADATA =
  createKeyedMetadata<NotificationSettingKey>(
    NOTIFICATION_SETTINGS_METADATA,
    "notifications",
  );

/** Keyed privacy settings metadata for easy access */
export const PRIVACY_METADATA = createKeyedMetadata<PrivacySettingKey>(
  PRIVACY_SETTINGS_METADATA,
  "privacy",
);

/** Keyed sync settings metadata for easy access */
export const SYNC_METADATA = createKeyedMetadata<SyncSettingKey>(
  SYNC_SETTINGS_METADATA,
  "sync",
);

/** Keyed accessibility settings metadata for easy access */
export const ACCESSIBILITY_METADATA =
  createKeyedMetadata<AccessibilitySettingKey>(
    ACCESSIBILITY_SETTINGS_METADATA,
    "accessibility",
  );

/** Keyed AI settings metadata for easy access */
export const AI_METADATA = createKeyedMetadata<AISettingKey>(
  AI_SETTINGS_METADATA,
  "ai",
);

/** Keyed advanced settings metadata for easy access */
export const ADVANCED_METADATA = createKeyedMetadata<AdvancedSettingKey>(
  ADVANCED_SETTINGS_METADATA,
  "advanced",
);

/**
 * Get metadata for a setting by its full key (e.g., 'study.dailyGoal').
 */
export function getSettingMetadata(
  key: string,
): SettingMetadata<unknown> | undefined {
  const allMetadata = [
    ...STUDY_SETTINGS_METADATA,
    ...DISPLAY_SETTINGS_METADATA,
    ...AUDIO_SETTINGS_METADATA,
    ...NOTIFICATION_SETTINGS_METADATA,
    ...PRIVACY_SETTINGS_METADATA,
    ...SYNC_SETTINGS_METADATA,
    ...ACCESSIBILITY_SETTINGS_METADATA,
    ...AI_SETTINGS_METADATA,
    ...ADVANCED_SETTINGS_METADATA,
  ];
  return allMetadata.find((m) => m.key === key);
}
