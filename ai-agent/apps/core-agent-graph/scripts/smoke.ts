import { runCoreAgentPrototype } from '../src/index.js';
import type { CoreAgentState } from '../src/state.js';

async function main() {
  const initialState: CoreAgentState = {
    userMessage: 'LangGraph guard smoke teszt',
    logs: [],
  };

  const result = await runCoreAgentPrototype(initialState);
  const offers = result.recommendations?.offers?.length ?? 0;
  const fallback = result.fallbackReason ?? 'none';
  const contextSource = result.contextSource ?? 'unknown';
  console.log(JSON.stringify({
    sessionId: result.sessionId,
    offers,
    fallback,
    contextSource,
  }));
}

main().catch(error => {
  console.error('LangGraph smoke hiba:', error);
  process.exit(1);
});
