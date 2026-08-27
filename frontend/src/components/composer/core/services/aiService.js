/**
 * AI Service — OpenRouter API integration for quantum circuit explanations.
 *
 * Primary path: calls the Flask backend `/api/ai-explain` which proxies to
 * OpenRouter securely (API key stays server-side).
 *
 * Fallback path: if VITE_OPENROUTER_API_KEY is set AND the backend is
 * unreachable, calls OpenRouter directly from the browser.
 */

import { API_ENDPOINTS } from '../config/api'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const BACKEND_AI_URL = API_ENDPOINTS.AI_EXPLAIN

// Configurable model — defaults to gpt-4o-mini via OpenRouter
const DEFAULT_MODEL = import.meta.env.VITE_AI_MODEL || 'openai/gpt-4o-mini'

// Frontend-only API key (optional — backend proxy is preferred)
const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || ''

// ---------------------------------------------------------------------------
// System prompt — quantum computing tutor persona
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a quantum computing tutor designed for beginners. Follow these rules strictly:

1. **Simple Explanation First**: Start with a plain-English analogy that a non-technical person can understand. Use everyday analogies (coins, light switches, dice, etc.).
2. **Technical Explanation**: Follow with a precise technical description using Dirac notation and matrix representations where helpful.
3. **Step Insight**: If the user is asking about a specific step in the circuit, explain what happens to the quantum state at that step and why.
4. **Final Output Explanation**: Summarize what the entire circuit produces and what the measurement outcomes mean.
5. Keep answers concise but informative — aim for 150-300 words.
6. Use markdown formatting (bold, bullet points, code blocks for math).
7. Be encouraging and supportive — this is a learning environment.`

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

/**
 * Build the user prompt from circuit context and user action.
 *
 * @param {Object} params
 * @param {string} params.circuitName - Name of the circuit (if loaded from template)
 * @param {number} params.qubits - Number of qubits
 * @param {Array}  params.gates - Gate list from the store
 * @param {string} params.userAction - One of "explain_gate" | "explain_circuit" | "explain_step"
 * @param {Object} [params.gateClicked] - The specific gate the user clicked on
 * @param {number} [params.currentStep] - Current step index for step-by-step mode
 * @param {Object} [params.simulationResult] - Simulation result data if available
 * @returns {string} Formatted user prompt
 */
export function buildUserPrompt({
  circuitName = 'Custom Circuit',
  qubits,
  gates,
  userAction,
  gateClicked = null,
  currentStep = null,
  simulationResult = null,
}) {
  // Format gates into a readable summary
  const gatesSummary = gates
    .map((g) => {
      let desc = `${g.type} on q${g.qubit ?? g.target ?? '?'} at step ${g.step ?? '?'}`
      if (g.controlQubit !== undefined) desc += ` (control: q${g.controlQubit})`
      if (g.controlQubit2 !== undefined) desc += ` (control2: q${g.controlQubit2})`
      if (g.swapQubit !== undefined) desc += ` (swap with: q${g.swapQubit})`
      if (Array.isArray(g.targets)) desc += ` (spans: ${g.targets.map((t) => `q${t}`).join(', ')})`
      if (g.theta !== undefined) desc += ` (θ=${Number(g.theta).toFixed(4)} rad)`
      return desc
    })
    .join('\n')

  let prompt = `Explain this quantum circuit:\n\n`
  prompt += `**Circuit Name:** ${circuitName}\n`
  prompt += `**Number of Qubits:** ${qubits}\n`
  prompt += `**Gates:**\n${gatesSummary || '(no gates yet)'}\n`
  prompt += `**User Action:** ${userAction}\n`

  if (gateClicked) {
    let clickedDesc = `${gateClicked.type} on q${gateClicked.qubit ?? gateClicked.target ?? '?'} at step ${gateClicked.step ?? '?'}`
    if (gateClicked.controlQubit !== undefined) clickedDesc += ` (control: q${gateClicked.controlQubit})`
    if (gateClicked.theta !== undefined) clickedDesc += ` (θ=${Number(gateClicked.theta).toFixed(4)} rad)`
    prompt += `**Gate Clicked:** ${clickedDesc}\n`
  }

  if (currentStep !== null) {
    prompt += `**Current Step:** ${currentStep}\n`
    // Include only gates at or before this step for context
    const stepsUpTo = gates.filter((g) => (g.step ?? 0) <= currentStep)
    prompt += `**Gates up to this step:**\n${stepsUpTo.map((g) => `  - ${g.type} on q${g.qubit ?? g.target ?? '?'} at step ${g.step}`).join('\n')}\n`
  }

  if (simulationResult && simulationResult.probabilities) {
    prompt += `**Simulation Probabilities:** ${JSON.stringify(simulationResult.probabilities)}\n`
  }

  prompt += `\nPlease return:\n`
  prompt += `- **Simple explanation** (analogy-based, beginner-friendly)\n`
  prompt += `- **Technical explanation** (Dirac notation, matrix ops)\n`
  if (currentStep !== null) {
    prompt += `- **Step insight** (what happens at step ${currentStep})\n`
  }
  prompt += `- **Final output explanation** (what the circuit produces)\n`

  return prompt
}

// ---------------------------------------------------------------------------
// API callers
// ---------------------------------------------------------------------------

/**
 * Call the Flask backend AI proxy endpoint.
 */
async function callBackendAI(userPrompt) {
  const response = await fetch(BACKEND_AI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: userPrompt,
      model: DEFAULT_MODEL,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error || `Backend AI error: ${response.status}`)
  }

  const data = await response.json()
  return data.explanation || data.content || 'No explanation returned.'
}

/**
 * Call OpenRouter directly from the browser (fallback).
 */
async function callOpenRouterDirect(userPrompt) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('No API key configured. Set VITE_OPENROUTER_API_KEY in your .env file or configure the backend.')
  }

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'Quantum Logic Gate Simulator',
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1024,
      temperature: 0.7,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error?.message || `OpenRouter error: ${response.status}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || 'No explanation returned.'
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get an AI explanation for the given circuit context.
 * Tries backend first, falls back to direct OpenRouter call.
 *
 * @param {Object} params — same shape as buildUserPrompt params
 * @returns {Promise<string>} The AI explanation text (markdown)
 */
export async function getAIExplanation(params) {
  const userPrompt = buildUserPrompt(params)

  try {
    // Primary: backend proxy (secure — API key never leaves server)
    return await callBackendAI(userPrompt)
  } catch (backendErr) {
    console.warn('[AI Service] Backend unavailable, trying direct OpenRouter call:', backendErr.message)

    try {
      // Fallback: direct browser call (requires VITE_OPENROUTER_API_KEY)
      return await callOpenRouterDirect(userPrompt)
    } catch (directErr) {
      console.error('[AI Service] Direct call also failed:', directErr.message)
      throw new Error(
        'AI service is currently unavailable. Please check your API key configuration and try again.'
      )
    }
  }
}

/**
 * Quick gate explanation — pre-built prompts for single gate context.
 */
export async function explainGate(gate, circuitContext) {
  return getAIExplanation({
    ...circuitContext,
    userAction: 'explain_gate',
    gateClicked: gate,
  })
}

/**
 * Full circuit explanation.
 */
export async function explainCircuit(circuitContext) {
  return getAIExplanation({
    ...circuitContext,
    userAction: 'explain_circuit',
  })
}

/**
 * Step-by-step explanation — explain what happens at a specific step.
 */
export async function explainStep(step, circuitContext) {
  return getAIExplanation({
    ...circuitContext,
    userAction: 'explain_step',
    currentStep: step,
  })
}
