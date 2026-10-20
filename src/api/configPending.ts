import { nextTick } from 'vue'
import type { Draft } from '@/composables/useDraft'
import type { UciChange, UciSection } from '@/api/uci'

/**
 * Shared helpers for the four configuration pages.
 *
 * Every configuration page follows the same paradigm:
 *
 *  1. read the committed configuration (`uci.get`),
 *  2. let the user edit it,
 *  3. stage the edit into the UCI delta (`uci.set` / `uci.add` / `uci.delete`),
 *  4. commit and apply it (`uci.commit` + service reload).
 *
 * Step 3 is the interesting one: the router keeps the staged change in
 * `/tmp/.uci/<config>` and reports it through `uci.changes`. The problem is
 * that `uci.changes` only knows the *new* value — the old one is gone. This
 * module therefore keeps the old value of every staged option in a local
 * record (`StagedEdit`), so the pages can show "旧值 → 新值" and can rebuild
 * the "what will be applied" view after a page reload.
 */

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

/** A change the console staged into the UCI delta of a config file. */
export interface StagedEdit {
  /** The kind of the change. */
  op: 'set' | 'delete' | 'add'
  /** UCI section name (`lan`, `cfg01e63d`, …). */
  section: string
  /** UCI option name, empty when the whole section is affected. */
  option?: string
  /** The new value of the option. */
  value?: string
  /** The section type, only known for a newly added section. */
  type?: string
  /** The value that is committed on the router (the old value). */
  before: string
}

/** A pending change, ready to be rendered. */
export interface PendingEntry {
  op: StagedEdit['op']
  section: string
  option: string
  type: string
  /** The committed value. */
  before: string
  /** The value that will be applied. */
  after: string
  /** `section.option`, the identity of the change. */
  target: string
  /** A readable name of the option, empty when there is none. */
  label?: string
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

/** Reads an option as a displayable string. */
export function optionText(section: UciSection | undefined, option: string): string {
  const value = section?.[option]
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean).join(' ')
  return String(value)
}

/** The key that identifies an option inside a section. */
export function editKey(section: string, option?: string): string {
  return `${section}.${option ?? ''}`
}

/** A readable label of a UCI operation. */
export function opText(op: string): string {
  if (op === 'set') return '设置'
  if (op === 'delete') return '删除'
  if (op === 'add') return '新增'
  if (op === 'rename') return '重命名'
  if (op === 'move') return '移动'
  return op
}

/* ------------------------------------------------------------------ *
 * The effective configuration
 * ------------------------------------------------------------------ */

/**
 * Applies the staged edits on top of the committed configuration.
 *
 * The result is what the configuration will look like after "保存并应用":
 * new sections appear, changed options carry their new value and deleted
 * sections / options are gone. The pages render this view, so a staged edit
 * is visible immediately — no matter whether the router's `uci.get` already
 * reports the delta or not.
 */
export function applyEdits(
  baseline: Record<string, UciSection>,
  edits: StagedEdit[]
): Record<string, UciSection> {
  const result: Record<string, UciSection> = {}
  for (const [key, section] of Object.entries(baseline ?? {})) {
    result[key] = { ...section }
  }

  for (const edit of edits ?? []) {
    if (!edit.section) continue

    if (edit.op === 'delete' && !edit.option) {
      delete result[edit.section]
      continue
    }

    if (!result[edit.section]) {
      result[edit.section] = {
        '.type': edit.type ?? '',
        '.name': edit.section,
        '.index': Object.keys(result).length
      }
    }

    if (edit.op === 'delete') {
      if (edit.option) delete result[edit.section][edit.option]
      continue
    }

    if (edit.op === 'set' && edit.option) {
      result[edit.section][edit.option] = edit.value ?? ''
    }
  }

  return result
}

/* ------------------------------------------------------------------ *
 * The change record
 * ------------------------------------------------------------------ */

/**
 * Merges newly staged edits into the recorded ones.
 *
 * An option that is edited twice keeps its *original* old value, so the list
 * always shows "committed value → value that will be applied".
 */
export function mergeEdits(existing: StagedEdit[], incoming: StagedEdit[]): StagedEdit[] {
  const merged = [...(existing ?? [])]

  for (const edit of incoming ?? []) {
    const index = merged.findIndex(
      (item) => item.op === edit.op && item.section === edit.section && item.option === edit.option
    )
    if (index < 0) {
      merged.push({ ...edit })
      continue
    }
    merged[index] = { ...merged[index], ...edit, before: merged[index].before }
  }

  return merged
}

/** Converts the recorded edits into the entries the pages render. */
export function toPendingEntries(edits: StagedEdit[]): PendingEntry[] {
  return (edits ?? []).map((edit) => ({
    op: edit.op,
    section: edit.section,
    option: edit.option ?? '',
    type: edit.type ?? '',
    before: edit.before ?? '',
    after: edit.op === 'delete' ? '' : (edit.value ?? ''),
    target: edit.option ? `${edit.section}.${edit.option}` : edit.section
  }))
}

/**
 * Builds the list of pending changes.
 *
 * The local record carries the old values, the router's `uci.changes` is the
 * authoritative list of what is staged. Changes the router reports but the
 * console did not stage itself (another page, a script, …) are appended with
 * their old value taken from the committed configuration.
 */
export function buildPendingEntries(
  baseline: Record<string, UciSection>,
  routerChanges: UciChange[],
  edits: StagedEdit[]
): PendingEntry[] {
  const entries = toPendingEntries(edits)
  const known = new Set(entries.map((entry) => editKey(entry.section, entry.option)))

  for (const change of routerChanges ?? []) {
    const option = change.option ?? ''
    const key = editKey(change.section, option)
    if (known.has(key)) continue
    known.add(key)

    entries.push({
      op: change.op === 'add' ? 'add' : change.op === 'delete' ? 'delete' : 'set',
      section: change.section,
      option,
      type: change.type ?? '',
      before: option ? optionText(baseline?.[change.section], option) : '',
      after: change.op === 'delete' ? '' : (change.value ?? ''),
      target: option ? `${change.section}.${option}` : change.section
    })
  }

  return entries
}

/**
 * Reads the old value of an option out of the effective configuration.
 * The pages use it to fill the `before` field of a freshly staged edit.
 */
export function readEffective(
  baseline: Record<string, UciSection>,
  edits: StagedEdit[],
  section: string,
  option?: string
): string {
  if (!option) return ''
  const view = applyEdits(baseline, edits)
  return optionText(view[section], option)
}

/**
 * Merges freshly staged edits into the record of a page.
 *
 * The old value of every edit is taken from the effective configuration, so
 * the list shows the committed value on the left and the value that will be
 * applied on the right. An option that is edited twice keeps its original old
 * value.
 */
export function stageEdits(
  baseline: Record<string, UciSection>,
  existing: StagedEdit[],
  incoming: StagedEdit[]
): StagedEdit[] {
  const filled = (incoming ?? []).map((edit) => ({
    ...edit,
    before: edit.before || readEffective(baseline, existing, edit.section, edit.option)
  }))
  return mergeEdits(existing, filled)
}

/* ------------------------------------------------------------------ *
 * Draft handling
 * ------------------------------------------------------------------ */

/**
 * Clears a draft after the value watcher has flushed.
 *
 * `useDraft` watches its value deeply and marks the draft as dirty on every
 * change — including the change that resets the draft to the state of the
 * router. Waiting for the watcher to run before the clear keeps the draft
 * empty instead of re-saving it right away.
 */
export async function resetDraft<T extends object>(draft: Draft<T>): Promise<void> {
  await nextTick()
  draft.clear()
}
