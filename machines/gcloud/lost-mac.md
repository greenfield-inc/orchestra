# Lost or compromised Mac: cut off its gcloud tokens

The accounts in each org's `gcloud-no-reauth@` group are exempt from Google
Cloud reauth for the gcloud CLI and Application Default Credentials (ADC). A
refresh token on their Macs, the always-on Mini included (FileVault off),
therefore never expires on its own and carries the person's full rights,
production and IAM included. Use this page as soon as a Mac is lost, stolen, or
suspected compromised.

Do it once per affected account, in that account's org (dcouple.ai or
bloomapi.com). You need an admin of that org. If the lost Mac held your own
admin session, use another device, or ask another super admin of that org to
do these steps for you.

## 1. Put the account back on reauth

Remove the account from the exempt group. The org's normal session control
applies again to its next token refresh.

- Admin console: [admin.google.com](https://admin.google.com) → Directory →
  Groups → `gcloud-no-reauth@<org domain>` → Members → select the account →
  Remove member.
- Or, in a terminal signed in as an admin of that org:

  ```bash
  gcloud identity groups memberships delete \
    --group-email=gcloud-no-reauth@<org domain> --member-email=<account>
  ```

## 2. Revoke the account's gcloud and ADC tokens

This kills the refresh tokens on every machine the account signed in on, so
the lost Mac's copies stop working at once.

1. Admin console → Directory → Users → the account → Security.
2. Open the panel that lists the account's apps with access (Google labels it
   "Connected applications" or "Third-party apps with account access").
3. Revoke **Google Cloud SDK** (the gcloud CLI, client
   `32555940559.apps.googleusercontent.com`) and **Google Auth Library** (ADC,
   client `764086051850-6qr4p6gpi6hn506pt8ejuq83di341hur.apps.googleusercontent.com`).

The same revocation through the Directory API, per client ID, needs a token
with the `admin.directory.user.security` scope:
`DELETE https://admin.googleapis.com/admin/directory/v1/users/<account>/tokens/<client id>`.

## 3. Reset the account's sign-in cookies

Admin console → Directory → Users → the account → Security → Sign-in cookies →
Reset. This signs the account out of browser sessions, including the Cloud
console. If the Mac was stolen, also reset the account's password on the same
page.

## 4. Remove the Mac from the tailnet

In the Tailscale admin console, remove the lost machine, so it can no longer
reach the Mini or the other Macs.

## 5. Afterwards

- Every other Mac that account signs in on now needs a fresh sign-in
  (`gauth-grain` or `gauth-bloom` for Tyler's accounts; Parsa uses his own
  steps). Until then, Agent Farm's launch check tells agents that gcloud is
  unavailable.
- Losing a Mac is a trigger to pick up option A (per-person agent users with
  least-privilege roles) from the gcloud reauth plan. Put the account back in
  the group only once you have decided about A.
