import { BookOpenCheck, Code2, Coins, Gift, GitCommitHorizontal, KeyRound, LibraryBig, ListChecks, ListTodo, Sparkles, Type } from "lucide-react";
import { day, fmt, Group, Stat } from "../stats-ui";

export type PlatformStats = {
  collections: number;
  entries: number;
  checklistTasks: number;
  todoTasks: number;
  coins: { total: number; arcade: number; codes: number; achievements: number };
  redemptions: { total: number; repeats: number };
  cosmeticsGranted: number;
};
export type CodeStats = { generatedAt: string; commit: string; commits: number; files: number; lines: number; characters: number; history?: { date: string; commit: string; commits: number; files: number; lines: number; characters: number }[] };

/** Platform-wide totals (aggregates only) and a reproducible snapshot of the codebase. */
export function AmethystStatsView({ platform, code, computedAt }: { platform: PlatformStats; code: CodeStats; computedAt: string }) {
  const codeHistory = (key: "lines" | "characters" | "commits") => (code.history ?? [{ date: code.generatedAt.slice(0, 10), ...code }]).map((snapshot) => ({ date: snapshot.date, value: snapshot[key] }));
  return (
    <>
      <Group id="library" title="Across Amethyst" meta={<>Live totals across every account · <time dateTime={computedAt}>as of {day.format(new Date(computedAt))}</time></>}>
        <Stat historyKey="collections" icon={LibraryBig} label="Collections" value={platform.collections} definition="Collections that currently exist." />
        <Stat historyKey="entries" icon={BookOpenCheck} label="Entries" value={platform.entries} definition="Entries in all collections that currently exist." />
        <Stat historyKey="checklist_tasks" icon={ListChecks} label="Archive checklist tasks" value={platform.checklistTasks} definition="Tasks in entry checklists, open and done. Markdown task lines in notes are not included." />
        <Stat historyKey="todo_tasks" icon={ListTodo} label="To Do tasks" value={platform.todoTasks} definition="Tasks in To Do lists, open and completed. Steps are not counted." />
      </Group>
      <Group id="economy" title="Coins & rewards" meta="Live ledger totals" wide>
        <Stat
          icon={Coins}
          historyKey={["coins_arcade", "coins_codes", "coins_achievements"]}
          label="Coins awarded"
          value={platform.coins.total}
          definition={<>Sum of reward ledger entries: {fmt(platform.coins.arcade)} from Arcade runs, {fmt(platform.coins.codes)} from Vault codes, {fmt(platform.coins.achievements)} from achievements. Excludes Slots payouts, purchases and balances.</>}
        />
        <Stat
          icon={KeyRound}
          historyKey="redemptions"
          label="Successful code redemptions"
          value={platform.redemptions.total}
          definition={<>Every successful Vault redemption. {platform.redemptions.repeats ? <>{fmt(platform.redemptions.repeats)} of them are repeat uses a code allowed for the same account.</> : "None are repeats of the same code by the same account."}</>}
        />
        <Stat historyKey="cosmetics_granted" icon={Gift} label="Cosmetics granted" value={platform.cosmeticsGranted} definition="All unique account–cosmetic ownerships, including shop purchases and grants from codes or achievements." />
      </Group>
      <Group
        id="code"
        title="The codebase"
        wide
        meta={<>Snapshot of commit <code className="font-mono">{code.commit}</code> · last updated <time dateTime={code.generatedAt}>{day.format(new Date(code.generatedAt))}</time></>}
      >
        <Stat historyKey="lines" history={codeHistory("lines")} icon={Code2} label="Lines of code" value={code.lines} definition={<>Lines in {fmt(code.files)} tracked source files (TypeScript, CSS, SQL, scripts). Excludes dependencies, lockfiles, generated files and data.</>} />
        <Stat historyKey="characters" history={codeHistory("characters")} icon={Type} label="Characters of source code" value={code.characters} definition="Characters in the same files at the snapshot. Not the number of characters contributors typed, which Git does not record." />
        <Stat historyKey="commits" history={codeHistory("commits")} icon={GitCommitHorizontal} label="Commits" value={code.commits} definition="Commits in the history leading up to the snapshot commit." />
      </Group>
      <p className="ui-empty flex items-start gap-2 px-4 py-3.5 text-xs leading-5 text-muted-foreground">
        <Sparkles aria-hidden className="mt-0.5 size-3.5 shrink-0 text-amethyst" />
        Only totals are shown: never accounts, emails, codes or what any one person did. Data removed with a deleted account is no longer counted.
      </p>
    </>
  );
}
