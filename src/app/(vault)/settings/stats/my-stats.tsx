import { Award, BookOpenCheck, CalendarCheck, Coins, Dices, FolderOpen, Gamepad2, Gem, LibraryBig, ListChecks, ListTodo, Puzzle, Target } from "lucide-react";
import { Bar, day, fmt, Group, Stat } from "../stats-ui";

export type MyStats = {
  memberSince: string | null;
  library: { collections: number; entries: number; added30d: number; completed: number; inProgress: number; pinned: number; progressDone: number; progressTotal: number };
  workspace: { notes: number; checklists: number; quickNotes: number; items: number; itemsDone: number; starredOpen: number };
  todo: { total: number; completed: number; completed7d: number; importantOpen: number };
  arcade: { balance: number; coinsIn: number; coinsOut: number; runs: number; favoriteGame: string | null; records: number; dailySudokus: number; slotSpins: number; slotBest: number };
  rewards: { achievements: number; achievementsTotal: number; cosmetics: number; codes: number };
};

const percent = (done: number, total: number) => (total > 0 ? `${Math.round((done / total) * 100)}%` : "—");
const plural = (count: number, one: string, many = `${one}s`) => `${fmt(count)} ${count === 1 ? one : many}`;
const FILL = "bg-[var(--ca,var(--amethyst))]";
const SOFT = "bg-[var(--ca,var(--amethyst))] opacity-45";
const REST = "bg-transparent";

/** The signed-in account's own totals, computed from what is saved now. */
export function MyStatsView({ stats }: { stats: MyStats }) {
  const { library, workspace, todo, arcade, rewards } = stats;
  const notStarted = library.entries - library.completed - library.inProgress;
  return (
    <>
      <Group id="archive" title="Your archive" meta={stats.memberSince ? `Member since ${day.format(new Date(stats.memberSince))}` : undefined}>
        <Stat
          icon={BookOpenCheck}
          historyKey="entries"
          label="Entries"
          value={library.entries}
          definition={<>{fmt(library.completed)} completed · {fmt(library.inProgress)} in progress · {fmt(notStarted)} not started. {plural(library.added30d, "entry", "entries")} added in the last 30 days.</>}
        >
          <Bar
            label={`${library.completed} completed, ${library.inProgress} in progress, ${notStarted} not started`}
            parts={[{ value: library.completed, className: FILL }, { value: library.inProgress, className: SOFT }, { value: notStarted, className: REST }]}
          />
        </Stat>
        <Stat
          icon={Target}
          historyKey="progress_done" totalKey="progress_total" percent
          label="Overall progress"
          value={percent(library.progressDone, library.progressTotal)}
          definition={library.progressTotal ? `${fmt(library.progressDone)} of ${fmt(library.progressTotal)} items that count toward entry progress are done.` : "Nothing counts toward entry progress yet."}
        >
          <Bar label={`${library.progressDone} of ${library.progressTotal} done`} parts={[{ value: library.progressDone, className: FILL }, { value: library.progressTotal - library.progressDone, className: REST }]} />
        </Stat>
        <Stat historyKey="collections" icon={LibraryBig} label="Collections" value={library.collections} definition={`${plural(library.pinned, "entry", "entries")} pinned to Home.`} />
        <Stat
          icon={FolderOpen}
          historyKey={["notes", "checklists", "quick_notes"]}
          label="Notes & checklists"
          value={workspace.notes + workspace.checklists + workspace.quickNotes}
          definition={`${plural(workspace.notes, "note")} and ${plural(workspace.checklists, "checklist")} in entry workspaces, plus ${plural(workspace.quickNotes, "quick note")}. Folders aren't counted.`}
        />
      </Group>

      <Group id="tasks" title="Tasks">
        <Stat
          icon={ListChecks}
          historyKey="checklist_done" totalKey="checklist_items"
          label="Checklist tasks done"
          value={workspace.items ? `${fmt(workspace.itemsDone)}/${fmt(workspace.items)}` : 0}
          definition={`Tasks in your entry checklists, whether or not they count toward progress. ${plural(workspace.starredOpen, "starred task")} still open.`}
        >
          <Bar label={`${workspace.itemsDone} of ${workspace.items} done`} parts={[{ value: workspace.itemsDone, className: FILL }, { value: workspace.items - workspace.itemsDone, className: REST }]} />
        </Stat>
        <Stat
          icon={ListTodo}
          historyKey="todo_completed" totalKey="todo_total"
          label="To Do tasks completed"
          value={todo.total ? `${fmt(todo.completed)}/${fmt(todo.total)}` : 0}
          definition={`${plural(todo.completed7d, "task")} completed in the last 7 days · ${fmt(todo.importantOpen)} important and still open. Deleted tasks aren't counted.`}
        >
          <Bar label={`${todo.completed} of ${todo.total} completed`} parts={[{ value: todo.completed, className: FILL }, { value: todo.total - todo.completed, className: REST }]} />
        </Stat>
      </Group>

      <Group id="arcade" title="Arcade & rewards" wide>
        <Stat historyKey="coins_balance" icon={Coins} label="Coin balance" value={arcade.balance} definition={`${fmt(arcade.coinsIn)} coins received and ${fmt(arcade.coinsOut)} spent in total, including Slots.`} />
        <Stat
          icon={Gamepad2}
          historyKey="runs"
          label="Arcade games played"
          value={arcade.runs}
          definition={<>{arcade.favoriteGame ? <>Most played: {arcade.favoriteGame}. </> : null}{plural(arcade.records, "personal record")} across games and modes. Sudoku is counted separately.</>}
        />
        <Stat historyKey="daily_sudokus" icon={Puzzle} label="Daily Sudokus solved" value={arcade.dailySudokus} definition="Daily puzzles you finished on their day." />
        <Stat historyKey="slot_spins" icon={Dices} label="Slot spins" value={arcade.slotSpins} definition={arcade.slotBest ? `Biggest single payout: ${plural(arcade.slotBest, "coin")}.` : "No winning spin yet."} />
        <Stat historyKey="achievements" icon={Award} label="Achievements earned" value={`${fmt(rewards.achievements)}/${fmt(rewards.achievementsTotal)}`} definition="Earned achievements out of all achievements, including hidden ones." />
        <Stat historyKey="cosmetics" icon={Gem} label="Cosmetics owned" value={rewards.cosmetics} definition={`Frames, decorations, badges, titles and game looks you own. ${plural(rewards.codes, "Vault code")} redeemed.`} />
      </Group>

      <p className="flex items-start gap-2 border-t border-white/[0.08] pt-5 text-xs leading-5 text-muted-foreground">
        <CalendarCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-amethyst" />
        Only you can see these numbers. They&rsquo;re counted from what&rsquo;s saved right now, so deleting something removes it from your stats.
      </p>
    </>
  );
}
