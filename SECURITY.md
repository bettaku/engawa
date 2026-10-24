# Security Policy

## Reporting a vulnerability

If you discover a security issue in Engawa, please report it privately with **[this form](https://github.com/bettaku/engawa/security/advisories/new)** (GitHub private vulnerability reporting). Do not open a public issue.

This lets us assess the risk and make a fix available before the details become public.

Engawa is based on CherryPick and Misskey. If the issue also affects Misskey, please report it to [Misskey](https://github.com/misskey-dev/misskey/security/advisories/new) as well, so that the fix can reach everyone.

> [!NOTE]
> CNA [requires](https://www.cve.org/ResourcesSupport/AllResources/CNARules#section_5-2_Description) that CVEs include a description in English for inclusion in the CVE Catalog.
>
> When creating a security advisory, write all content in English (you may include a non-English description alongside the English one).

## Sending a patch

If you can also create a patch, please open a pull request on the temporary private fork of the advisory.

> [!NOTE]
> Because of a GitHub limitation, a pull request on the private fork cannot be merged unless it is up to date with the `develop` branch. Please keep it rebased onto `develop`.
