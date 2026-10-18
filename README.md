# Git Exercise: Internet Engineering, Fall 1405

## Report information

- AI use: I used Claude to improve the writing and wording of my answers, to format the tables and the layout of this README, to come up with better examples, and to write clearer comments on the commands. I know the answers to all of the questions and can explain every part of them in the in-person session.

Branch names, file paths and commit hashes below are made-up examples.

---

## Question 1: merge and rebase

Both commands bring the work from one branch into another. They differ in how they do it.

`git merge` takes the tip of the other branch and combines it with the current branch using a three-way merge (the two tips plus their common ancestor). If the current branch has moved on, Git records the result as a new merge commit with two parents. Nothing existing is changed, so history keeps the real order of events, including the fact that two lines of work ran in parallel. If the current branch has no new commits, Git just moves the branch pointer forward (a fast-forward) and creates no merge commit.

`git rebase` takes the commits that exist only on the current branch, sets them aside, moves the branch to the tip of the target, and replays the commits one by one on top of it. Each replayed commit is a new commit with a new hash, even if its content is the same. The result is a straight line of commits with no merge commit, but the original commits are rewritten.

| | merge | rebase |
|---|---|---|
| Existing commits | unchanged | replaced by new copies |
| History shape | branches and merge commits visible | linear |
| Conflicts | resolved once, in the merge commit | may need resolving for each replayed commit |

When I would use merge: a finished feature branch going into `main`, which other people also use.

```
git switch main
git merge feature-login
```

Merge is the right choice here because it doesn't rewrite any commit that teammates may already have. The merge commit also marks where the feature entered `main`, and `git revert -m 1 <merge-commit>` can undo the whole feature later.

When I would use rebase: my own local feature branch has fallen behind `main`, and I want to update it before opening a pull request.

```
git switch feature-login
git fetch origin
git rebase origin/main
```

Nobody else has built on these commits, so rewriting them is harmless. The pull request then shows only my commits, on top of current `main`, without a pile of "merge main into feature" commits. If the branch was already pushed, I need `git push --force-with-lease` afterwards, which is another reason to rebase only branches that I alone use. The rule is not to rebase commits that other people already have.

---

## Question 2: choosing part of the changes (hunks)

A hunk is one contiguous block of changes in a `git diff`. Git splits a file's diff into hunks, each starting with a header like this:

```
@@ -12,7 +12,9 @@ def load_config():
```

It means "starting at line 12, 7 lines in the old file correspond to starting at line 12, 9 lines in the new file". The header is followed by the changed lines (`-` removed, `+` added) and a few unchanged context lines around them. Two edits that are far apart in a file normally land in separate hunks.

To pick hunks interactively, use patch mode:

```
git add -p app.py
```

(`git add --patch`, or `git add -i` and then choosing "patch".) Git shows one hunk at a time and asks `Stage this hunk [y,n,q,a,d,s,e,?]?`:

- `y`: stage this hunk
- `n`: don't stage it
- `s`: split the hunk into smaller hunks, when there are unchanged lines between the changes
- `e`: edit the hunk by hand, to stage only some lines of it
- `a` / `d`: stage / skip this hunk and all remaining hunks in the file
- `q`: quit, leaving the remaining hunks unstaged
- `?`: show help

Afterwards I check what I selected and what is left:

```
git diff --staged    # what the next commit will contain
git diff             # what is still unstaged
git commit -m "Fix off-by-one in pagination"
```

The benefit is that one working session often produces unrelated edits in the same file, for example a bug fix plus a debugging `print` plus a small refactor. With patch mode each edit goes into its own commit with its own message. Such commits are easier to review, to revert one at a time with `git revert`, and to search later with `git log` or `git bisect`. It also makes it easy to leave debugging leftovers out of the commit.

---

## Question 3: finding where a bug came from (`git bisect`)

`git bisect` does a binary search over history. I give it one commit known to be bad and one known to be good. Git checks out a commit halfway between them, I test it and say whether it is good or bad, and Git discards half of the remaining range. This repeats until only one commit is left: the first bad commit.

Steps:

```
git bisect start
git bisect bad                 # the current commit (HEAD) has the bug
git bisect good v1.2.0         # this tag is known to work
```

Git replies with something like "Bisecting: 87 revisions left to test after this (roughly 7 steps)" and checks out the middle commit. Then:

1. Build or run the program and check for the bug.
2. Tell Git the result with `git bisect good` or `git bisect bad`. If the commit can't be tested (for example it doesn't build for an unrelated reason), use `git bisect skip`.
3. Git checks out the next midpoint. Repeat from step 1.
4. At the end Git prints `<hash> is the first bad commit`, with the commit message and changed files.
5. `git bisect reset` returns to the branch I started on.

If the check can be scripted, Git can do the whole search:

```
git bisect start HEAD v1.2.0
git bisect run ./test.sh
```

The script must exit with 0 for a good commit and with a code from 1 to 127 (except 125) for a bad one. Exit code 125 means "skip this commit".

Example: a user reports that the login page started returning a 500 error after version 1.2.0, and 200 commits were made since the tag. Reading all of them is impractical, but bisect needs at most 8 tests, because log2(200) is about 7.6. The result might be commit `a1b2c3d`, "Refactor session handling", which shows exactly which change to look at.

This is useful because the number of tests grows with the logarithm of the number of commits, not linearly. It also doesn't require understanding the code: it only needs a reliable way to tell good from bad. And it points to the single commit that introduced the problem, which makes the cause and the fix much easier to find.

---

## Question 4: checking changes before a commit

The situation: `README.md` is tracked and committed before. I staged part of the new changes, then edited the file again without running `git add`. There is also a `tmp/` directory with untracked temporary files.

### 4.1 Checking the state

```
git status
git diff
git diff --staged
```

- `git status` lists `README.md` twice: under "Changes to be committed" (staged) and under "Changes not staged for commit". With `git status -s` it shows as `MM README.md`. It also lists `tmp/` under "Untracked files".
- `git diff` compares the working tree with the index (the staging area). It shows only the edits made after I ran `git add`.
- `git diff --staged` (same as `--cached`) compares the index with the last commit (`HEAD`). It shows exactly what would go into the next commit.

The two sets differ in when they were made. The staged set is the snapshot of the file taken when I ran `git add`. The unstaged set is everything I changed after that. `git add` copies the file's content at that moment, so later edits aren't included unless I add the file again.

### 4.2 What a plain `git commit` records

A commit without `-a` records the contents of the index. So the commit contains only the staged changes, the version of `README.md` as it was when I ran `git add`. The later edits stay in the working tree as unstaged changes. Right after the commit, `git status` still shows `README.md` as modified, and `git diff` shows the later edits. The `tmp/` files are not committed either, since untracked files are never included unless added.

### 4.3 Keeping `tmp/` out of future commits

I add this line to a `.gitignore` file in the repository root:

```
/tmp/
```

The leading slash makes the pattern match only `tmp` in the repository root, and the trailing slash makes it match directories only. Then I commit `.gitignore` itself so teammates get the rule too. If the rule is only for me, I can put it in `.git/info/exclude`, which is not shared. `git check-ignore -v tmp/cache.txt` shows which rule matches a path.

This is not enough for a file that is already tracked. Ignore rules only apply to untracked files. A tracked file stays tracked, and Git keeps recording its changes no matter what `.gitignore` says. To stop tracking it while keeping the file on disk:

```
git rm --cached path/to/file        # add -r for a directory
git commit -m "Stop tracking path/to/file"
```

and keep the ignore rule so it doesn't get added again. In this scenario `tmp/` has only untracked files, so the `.gitignore` entry is enough.

---

## Question 5: resolving a merge conflict

### 5.1 Why it happened

`description-feature` and `main` both started from the same commit. Each side changed the same line of `README.md`, but to different text. Git's three-way merge compares each side with the common ancestor. When only one side changed a piece of text, Git takes that side's version. When both sides changed the same lines differently, Git has no way to know which is right, so it stops and reports a conflict.

Not every change by two people in the same file causes a conflict. If the two edits are in different parts of the file, Git merges them automatically. If both sides made the identical change, that merges cleanly too. Edits on directly adjacent lines can still conflict, because Git treats them as touching the same region.

### 5.2 Finding the conflicts

```
git status
```

lists the file under "Unmerged paths" as `both modified: README.md`. To list only the conflicted files:

```
git diff --name-only --diff-filter=U
```

Inside the file, Git writes both versions between conflict markers:

```
<<<<<<< HEAD
Text from main (the branch I'm merging into)
=======
Text from description-feature
>>>>>>> description-feature
```

The part between `<<<<<<< HEAD` and `=======` is the current branch's version (`main`). The part between `=======` and `>>>>>>> description-feature` is the incoming branch's version. The markers are not part of the real content. They are there so I can see both sides and edit the file. With `git config merge.conflictStyle zdiff3`, Git also shows the common ancestor's text in the file, which often makes the decision easier. The three versions can also be read directly with `git show :1:README.md` (ancestor), `:2:` (ours) and `:3:` (theirs).

### 5.3 Resolving it while keeping both changes

```
git switch main
git merge description-feature        # reports: CONFLICT (content): Merge conflict in README.md
```

1. Open `README.md` in an editor.
2. Rewrite the conflicted section so that it contains the information from both versions, and delete the three marker lines.
3. Check that no markers remain:
   ```
   git diff --check
   grep -nE '^(<<<<<<<|=======|>>>>>>>)' README.md
   ```
   `git diff --check` reports leftover conflict markers, and the `grep` should print nothing.
4. Mark the file as resolved by staging it:
   ```
   git add README.md
   ```
5. Confirm with `git status` that there are no unmerged paths left.
6. Finish the merge:
   ```
   git commit
   ```
   Git opens the editor with a default merge message (`Merge branch 'description-feature'`). `git commit --no-edit` accepts it directly.
7. Check the result with `git log --graph --oneline`, which should show the merge commit with two parents.

### 5.4 Cancelling the merge

```
git merge --abort
```

This stops the merge and restores the branch, index and working tree to the state before `git merge` was run. Since the working tree was clean beforehand, nothing is lost. Nothing is committed, and `main` stays where it was.

---

## Question 6: undoing changes with the right command

### 6.1 Discarding unstaged edits to one file

```
git restore notes.txt
```

(older equivalent: `git checkout -- notes.txt`)

This overwrites `notes.txt` in the working tree with the version in the index. Since the index matches the last commit, this brings the file back to its committed content. Other files are not touched, and the index and the commit history don't change. The edits are lost for good, because they were never staged or committed, so Git has no copy of them. I would run `git diff notes.txt` first to be sure I really don't want them.

### 6.2 Unstaging a file but keeping my edits

```
git restore --staged notes.txt
```

(older equivalent: `git reset HEAD notes.txt`)

This resets the file's entry in the index to match `HEAD`. The working tree is untouched, so my edits are still in the file, and `git status` now lists the file under "Changes not staged for commit". No commit is created or changed.

### 6.3 Undoing a pushed commit on `main`

```
git revert <bad-commit-hash>
git push origin main
```

`git revert` creates a new commit that applies the opposite of the bad commit's changes. The working tree and index are updated and the revert commit is recorded (an editor opens for the message, or use `--no-edit`). The bad commit stays in history, followed by the commit that cancels it. Nothing that anyone already has is rewritten, so teammates just run `git pull` and get the fix like any other commit.

Deleting the commit and force-pushing is a bad choice here, for these reasons:

- Teammates have already fetched the old commit and may have built new commits on it. Rewriting `main` makes their history diverge from the remote one.
- After a force-push, their next `git pull` either fails, creates a confusing merge that brings the deleted commit back, or forces them to reset their branches by hand. Any local work based on the old history is at risk.
- A force-push can also discard commits that others pushed after the bad one, without anyone noticing.
- Rewriting shared history is generally avoided, and many teams block force-pushes to `main` with branch protection.

Revert keeps the record of what happened, and the mistake and its fix both remain visible in the log. That makes it the safe choice for a branch that other people use.
