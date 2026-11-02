import type { EngineInterface, Register } from 'claude-code'

type State = 'idle' | 'working' | 'blocked' | 'error' | 'ended'

type BackgroundTask = {
  id: string
  type: string
  status: string
  description: string
  command?: string
  agent_type?: string
  name?: string
}

type Loop = {
  id: string
  schedule: string
  recurring: boolean
  prompt: string
}

type Snapshot = {
  v: 1
  session_id: string
  cwd: string
  state: State
  event: string
  updated_at: string
  background_tasks: BackgroundTask[]
  loops: Loop[]
}

type Change = Partial<Omit<Snapshot, 'v' | 'updated_at'>> & { event: string }

type Pending = { background_tasks?: BackgroundTask[]; session_crons?: Loop[] }

const BLOCKING_NOTIFICATIONS = new Set(['permission_prompt', 'elicitation_dialog'])

let snapshot: Snapshot | undefined

async function write($: EngineInterface, change: Change): Promise<void> {
  const sessionId = change.session_id ?? snapshot?.session_id ?? (await $.session.id())
  snapshot = {
    v: 1,
    session_id: sessionId,
    cwd: change.cwd ?? snapshot?.cwd ?? (await $.session.cwd()),
    state: change.state ?? snapshot?.state ?? 'idle',
    event: change.event,
    updated_at: new Date(await $.clock.now()).toISOString(),
    background_tasks: change.background_tasks ?? snapshot?.background_tasks ?? [],
    loops: change.loops ?? snapshot?.loops ?? [],
  }
  const home = await $.env.get('HOME')
  await $.fs
    .write(`${home}/.maestro/_herdr_mod/${sessionId}/agent-status.json`, `${JSON.stringify(snapshot, null, 2)}\n`)
    .catch(() => undefined)
}

function pending(e: Pending): Pick<Snapshot, 'background_tasks' | 'loops'> {
  return { background_tasks: e.background_tasks ?? [], loops: e.session_crons ?? [] }
}

export const register: Register = on => {
  on('classic.SessionStart', async ($, e, next) => {
    await write($, {
      event: `SessionStart:${e.source}`,
      session_id: e.session_id,
      cwd: e.cwd,
      state: 'idle',
      background_tasks: [],
      loops: [],
    })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) await write($, { event: 'turn.start', state: 'working' })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.Stop', async ($, e, next) => {
    await write($, { event: 'Stop', session_id: e.session_id, cwd: e.cwd, state: 'idle', ...pending(e) })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.SubagentStop', async ($, e, next) => {
    await write($, { event: 'SubagentStop', session_id: e.session_id, cwd: e.cwd, ...pending(e) })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.StopFailure', async ($, e, next) => {
    await write($, { event: 'StopFailure', session_id: e.session_id, cwd: e.cwd, state: 'error' })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.PermissionRequest', async ($, e, next) => {
    await write($, { event: 'PermissionRequest', session_id: e.session_id, cwd: e.cwd, state: 'blocked' })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.Notification', async ($, e, next) => {
    if (BLOCKING_NOTIFICATIONS.has(e.notification_type)) {
      await write($, {
        event: `Notification:${e.notification_type}`,
        session_id: e.session_id,
        cwd: e.cwd,
        state: 'blocked',
      })
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.PostToolUse', async ($, e, next) => {
    if (snapshot?.state === 'blocked') {
      await write($, { event: 'PostToolUse', session_id: e.session_id, cwd: e.cwd, state: 'working' })
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    await write($, { event: 'AskUserQuestion', state: 'blocked' })
    const answered = await next(e)
    await write($, { event: 'AskUserQuestion:answered', state: 'working' })
    return answered
  }).catch(($, e, next) => next(e))

  on('classic.SessionEnd', async ($, e, next) => {
    await write($, {
      event: 'SessionEnd',
      session_id: e.session_id,
      cwd: e.cwd,
      state: 'ended',
      background_tasks: [],
      loops: [],
    })
    return next(e)
  }).catch(($, e, next) => next(e))
}
