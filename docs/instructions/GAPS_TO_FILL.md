---

#### **G. Context Performance Drift Detection** 

Tracks:

* recentAccuracy, accuracyTrend, performanceDeviation  
* hasDriftWarning, driftSeverity  
* hasOverconfidenceFlag, hasUnderconfidenceFlag  
* confidenceAccuracyCorrelation

---

### **2\. Implementation Gaps**

#### **🔴 Critical Gaps**

| Gap                                         | Current State                                                          | Impact                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **LKGC metrics calculation is stubbed**     | default-rules.ts has `[PLACEHOLDER]` comments, simplified ECE ≈ Brier  | Advanced metrics (gamma, d', Dunning-Kruger) return dummy values |
| **No calibration UI in mobile**             | Types exist, no dedicated calibration dashboard                        | Users can't see their calibration score or buckets               |
| **Reflection prompts not persisted**        | ReflectionPrompt/ReflectionResponse types exist, no route to save them | Reflection data lost, can't track improvement                    |
| **ai_metacognition plugin not implemented** | Listed as capability, no actual implementation                         | No AI-powered metacognitive coaching                             |

#### **🟠 Significant Gaps**

| Gap                                                     | Current State                                                       | Impact                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| **No reflection journal UI**                            | TODO.md lists as "Not Started"                                      | Can't capture "Why did I forget?" responses                |
| **ConfidenceCardContent renderer missing**              | Type defined, no mobile component to render it                      | Confidence-wrapped cards can't be displayed                |
| **Dunning-Kruger calculation placeholder**              | Returns clamp01(Math.max(0, bias)) \- just bias repurposed          | Doesn't actually detect low-mastery overestimation pattern |
| **Metacognitive sensitivity (gamma/d') not calculated** | Returns clamp01(1 \- Math.abs(bias))                                | Doesn't use signal detection theory metrics                |
| **Strategy effectiveness tracking missing**             | strategyEfficacyUplift returns bipolar(0) placeholder               | Can't measure which strategies actually work               |
| **ReflectionMetrics not populated**                     | Types exist, no code calculates insightRate, planFollowThroughScore | No quantified reflection quality                           |

#### **🟡 Minor Gaps**

| Gap                                      | Current State                                                             | Impact                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| **No historical calibration trend**      | Current score only, no trend line                                         | Can't show improvement over time                       |
| **Missing calibration by difficulty**    | Type CalibrationByDifficulty defined, not computed                        | Can't detect overconfidence on hard items specifically |
| **No calibration achievement in mobile** | Achievement defined (Self-Aware: 80% calibration), no unlock notification | Gamification incomplete                                |
| **Brier Score breakdown missing**        | Type has preAnswer/postAnswer breakdown, not computed                     | Can't distinguish prediction calibration from post-hoc |

---

### **3\. Summary: Metacognitive Training Capability**

| Capability                                | Status             | Quality                                  |
| ----------------------------------------- | ------------------ | ---------------------------------------- |
| **Measure confidence-accuracy gap**       | ✅ Working         | Basic but functional                     |
| **Detect overconfidence/underconfidence** | ✅ Working         | Simple bias calculation                  |
| **Prompt for pre-answer confidence**      | ⚠️ Partial         | Slider exists, not integrated everywhere |
| **Show calibration feedback**             | ⚠️ Partial         | Coaching rule exists, no persistent UI   |
| **Measure Dunning-Kruger effect**         | ❌ Stubbed         | Placeholder returns bias as D-K          |
| **Measure metacognitive sensitivity**     | ❌ Stubbed         | No gamma/d' calculation                  |
| **Track reflection quality**              | ❌ Not implemented | Types only                               |
| **Personalized calibration training**     | ❌ Not implemented | No adaptive difficulty for calibration   |
| **Strategy effectiveness tracking**       | ❌ Stubbed         | Placeholder values                       |

---

### **4\. Recommendations for Completion**

**Priority 1 \- Core Functionality:**

1. Implement ReflectionResponse persistence route
2. Build calibration dashboard in mobile app
3. Implement actual Dunning-Kruger calculation (compare low-mastery vs
   high-mastery calibration)

**Priority 2 \- Enhanced Metrics:**  
4\. Calculate Goodman-Kruskal gamma for metacognitive sensitivity  
5\. Implement proper ECE calculation with binning  
6\. Add historical calibration trend tracking

**Priority 3 \- Training Features:**  
7\. Create ConfidenceCardContent renderer component  
8\. Build reflection journal UI with prompts  
9\. Implement strategy effectivenessNow let me check the LKGC mastery
materializer for metacognition implementation:

---

#### **B. Confidence Slider in Reviews**

---

## **Metacognitive Training Features Analysis**

### **1\. SOME METACOGNITIVE FEATURES**

#### **1.1 Calibration System**

#### **How it works:**

- Creates 5 confidence buckets (0-20, 20-40, 40-60, 60-80, 80-100)
- Compares user's stated confidence vs. actual accuracy
- Calculates overall calibration score (0-100, 100 \= perfect)
- Computes overconfidenceBias and underconfidenceBias metrics
- Requires minimum 10 confidence-rated reviews

#### **1.2 Confidence Slider UI**

| Component                  | Location                                            | Status             |
| -------------------------- | --------------------------------------------------- | ------------------ |
| ConfidenceSlider component |                                                     | ✅ Complete        |
| 4-level labels             | "Guessing", "Uncertain", "Fairly sure", "Confident" | ✅ User-friendly   |
| Color-coded feedback       | Red→Orange→Blue→Green gradient                      | ✅ Visual feedback |

#### **1.3 Confidence-Rated Cards (Card Type)**

**Imp**

| Component                  | Location   | Status       |
| -------------------------- | ---------- | ------------ |
| ConfidenceCardContent type |            | ✅ Complete  |
| ConfidenceLevel type       | Same file  | ✅ Complete  |
| Card rendering logic       | Mobile app | ⚠️ Not found |

**Features of this card type:**

- Wraps any other card type
- Custom confidence prompt text
- Configurable confidence scale
- showCalibrationFeedback option for immediate feedback
- trackCalibration flag for metrics recording

#### **1.4 Overconfidence/Underconfidence Detection**

| Component              | Location                                                 | Status                     |
| ---------------------- | -------------------------------------------------------- | -------------------------- |
| Bias calculation       | CalibrationEngine.calculateCalibrationScore()            | ✅ Working                 |
| hasOverconfidenceFlag  | ContextPerformanceRecord in ecosystem.types.ts:595       | ✅ Tracked                 |
| hasUnderconfidenceFlag | Same location                                            | ✅ Tracked                 |
| Coaching rule for bias | calibrationFeedbackRule in default-decision-rules.ts:422 | ✅ Active when bias \> 15% |

#### **1.5 LKGC Advanced Metrics (Scientific Calibration)**

**Implementation Status: ✅ Types Complete, ⚠️ Calculations Placeholders**

| Metric                           |     |     |
| -------------------------------- | --- | --- |
| Brier Score                      |     |     |
| Expected Calibration Error (ECE) |     |     |
| Calibration Bias                 |     |     |
| Metacognitive Sensitivity        |     |     |
| Dunning-Kruger Indicator         |     |     |
| Confidence-Accuracy Correlation  |     |     |
| Calibration by Difficulty        |     |     |

#### **11.7 Context Performance Drift Detection**

| Component              |     |     |
| ---------------------- | --- | --- |
| updateDriftDetection() |     |     |
| contextSwitchAccuracy  |     |     |
| driftSeverity levels   |     |     |
| Multi-context sessions |     |     |

#### **1.8 Memory Integrity Score**

**Implementation Status: ✅ Fully Implemented**

| Component                  |                                                      |     |
| -------------------------- | ---------------------------------------------------- | --- |
| calculateMemoryIntegrity() |                                                      |     |
| /memory-integrity endpoint |                                                      |     |
| 5 weighted factors         | Retention, consistency, mastery, stability, variance |     |

#### **1.9 Meta-Learning Unlocks**

**Implementation Status: ✅ Defined**

| Unlock               | Requirement       | Feature               |
| -------------------- | ----------------- | --------------------- |
| Calibration Tracking | 25 mastered cards | stats.calibration     |
| Memory Integrity     | 50 mastered cards | stats.memoryIntegrity |
| Learning Strategies  | 7-day streak      | strategies            |

---

### **2\. METACOGNITIVE TRAINING MECHANISMS**

#### **How Skills Are Measured:**

1. **Calibration Score (0-100)**: Accuracy of self-prediction vs actual
   performance
2. **Overconfidence/Underconfidence Bias**: Systematic tendency to
   over/under-estimate
3. **Metacognitive Sensitivity**: Ability to distinguish known vs unknown items
   (d' signal detection)
4. **Dunning-Kruger Indicator**: Tendency to overestimate on low-mastery items
5. **Brier Score**: Probabilistic accuracy of predictions

#### **How Skills Are Trained:**

1. **Confidence Prompts**: Regular requests to predict confidence before
   answering
2. **Immediate Feedback**: Option to show "You said 80%, you were wrong"
3. **Coaching Interventions**: Nudges when bias detected
4. **Strategy Suggestions**: Recommendations when learning strategies are narrow
5. **Reflection Prompts**: Post-session metacognitive reflection triggers

---
