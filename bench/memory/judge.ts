// The judge and the shared answer harness (claude-mem-rs#52).
//
// Judge: LongMemEval's own answer-check prompts, copied from
// xiaowu0162/LongMemEval src/evaluation/evaluate_qa.py get_anscheck_prompt
// (MIT, Copyright (c) 2024 Di Wu), called as that script calls them: GPT-4o
// 2024-08-06, temperature 0, max_tokens 10, label = "yes" in the reply.
// The question is passed without its date, as the script does.
import { messages, PROXY, type Question, isAbstention } from './common.ts';

export const JUDGE_MODEL = 'gpt-4o-2024-08-06';
export const SECOND_JUDGE_MODEL = 'claude-sonnet-5-5';
export const ANSWER_MODEL = 'claude-haiku-4-5';

const BASE = 'I will give you a question, a correct answer, and a response from a model. Please answer yes if the response contains the correct answer. Otherwise, answer no. If the response is equivalent to the correct answer or contains all the intermediate steps to get the correct answer, you should also answer yes. If the response only contains a subset of the information required by the answer, answer no. ';

export function anscheckPrompt(task: string, question: string, answer: string, response: string, abstention: boolean): string {
  if (abstention) {
    return `I will give you an unanswerable question, an explanation, and a response from a model. Please answer yes if the model correctly identifies the question as unanswerable. The model could say that the information is incomplete, or some other information is given but the asked information is not.\n\nQuestion: ${question}\n\nExplanation: ${answer}\n\nModel Response: ${response}\n\nDoes the model correctly identify the question as unanswerable? Answer yes or no only.`;
  }
  switch (task) {
    case 'single-session-user':
    case 'single-session-assistant':
    case 'multi-session':
      return `${BASE}\n\nQuestion: ${question}\n\nCorrect Answer: ${answer}\n\nModel Response: ${response}\n\nIs the model response correct? Answer yes or no only.`;
    case 'temporal-reasoning':
      return `${BASE}In addition, do not penalize off-by-one errors for the number of days. If the question asks for the number of days/weeks/months, etc., and the model makes off-by-one errors (e.g., predicting 19 days when the answer is 18), the model's response is still correct. \n\nQuestion: ${question}\n\nCorrect Answer: ${answer}\n\nModel Response: ${response}\n\nIs the model response correct? Answer yes or no only.`;
    case 'knowledge-update':
      return `I will give you a question, a correct answer, and a response from a model. Please answer yes if the response contains the correct answer. Otherwise, answer no. If the response contains some previous information along with an updated answer, the response should be considered as correct as long as the updated answer is the required answer.\n\nQuestion: ${question}\n\nCorrect Answer: ${answer}\n\nModel Response: ${response}\n\nIs the model response correct? Answer yes or no only.`;
    case 'single-session-preference':
      return `I will give you a question, a rubric for desired personalized response, and a response from a model. Please answer yes if the response satisfies the desired response. Otherwise, answer no. The model does not need to reflect all the points in the rubric. The response is correct as long as it recalls and utilizes the user's personal information correctly.\n\nQuestion: ${question}\n\nRubric: ${answer}\n\nModel Response: ${response}\n\nIs the model response correct? Answer yes or no only.`;
    default:
      throw new Error(`no judge prompt for ${task}`);
  }
}

export interface Judgment { label: boolean; raw: string; model: string }

export async function judge(q: Question, response: string, model = JUDGE_MODEL): Promise<Judgment> {
  const prompt = anscheckPrompt(q.question_type, q.question, String(q.answer), response, isAbstention(q));
  if (model === JUDGE_MODEL) {
    let wait = 2000;
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(`${PROXY}/J.judge/openai/v1/chat/completions`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], n: 1, temperature: 0, max_tokens: 10 }),
      });
      if (r.ok) {
        const raw = (await r.json()).choices[0].message.content.trim();
        return { label: raw.toLowerCase().includes('yes'), raw, model };
      }
      if (attempt >= 6 || (r.status < 500 && r.status !== 429)) throw new Error(`judge ${r.status}: ${await r.text()}`);
      await new Promise(res => setTimeout(res, wait));
      wait *= 2;
    }
  }
  const c = await messages('J.judge2', { model, max_tokens: 10, temperature: 0, messages: [{ role: 'user', content: prompt }] });
  return { label: c.text.toLowerCase().includes('yes'), raw: c.text, model };
}

/**
 * The shared answer prompt, the same for arms B–G. The answer model runs
 * with the thinking budget Honcho's dialectic runs with (4,096 tokens), so
 * arm A against arm E differs only in Honcho's agent loop.
 */
export function answerPrompt(q: Question, context: string): string {
  return [
    'You are a chat assistant with a memory of your past conversations with this user. Below is what your memory holds that may bear on the question.',
    '',
    '<memory>',
    context.trim() || '(nothing found)',
    '</memory>',
    '',
    `The current date is ${q.question_date}.`,
    'Answer the question from the memory above. Use the dates in the memory to reason about time. If the memory does not contain the answer, say that you do not know.',
    '',
    `Question: ${q.question}`,
  ].join('\n');
}

export async function answer(tag: string, q: Question, context: string) {
  return messages(tag, {
    model: ANSWER_MODEL,
    max_tokens: 8192,
    thinking: { type: 'enabled', budget_tokens: 4096 },
    messages: [{ role: 'user', content: answerPrompt(q, context) }],
  });
}
