/**
 * The answer a form is drawn over, for the tests that render a form with renderToStaticMarkup. `useActionState` holds the answer of the
 * action in the browser and renderToStaticMarkup does not run it, so a test mocks `react` with this `useActionState` and sets `answered.state`:
 *
 *   vi.mock('react', async (importOriginal) => ({ ...(await importOriginal<typeof import('react')>()), useActionState: (await import('./support/action-state.ts')).useActionState }));
 */
export const answered = { state: null as unknown };

/** What `useActionState` answers while a form is drawn: the answer that was set, or the state the form started with when nobody answered. */
export const useActionState = (action: unknown, initial: unknown) => [answered.state ?? initial, action, false];
