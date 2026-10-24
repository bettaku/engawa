## Summary
This is a release PR. Release PRs are usually opened by the engawa Release Manager (`/release start <version>`).

For the release instructions, please see:
https://github.com/bettaku/engawa/blob/develop/CONTRIBUTING.md#releases

## For reviewers
Please check the following, and approve when you judge it ready to release.

- Is anything missing from `CHANGELOG_engawa.md`?
- Is the new version appropriate?
- Are there other changes that should be included in this release?
- Is there any problem in the overall diff?
- If there are commits that have not been reviewed, are they fine?
- Does the final build work as expected?

## Checklist
- [ ] The version in package.json is updated correctly
- [ ] `CHANGELOG_engawa.md` is updated without omissions or mistakes
- [ ] All CI checks pass
