# Agent Games 2026 agent

The production Proof Gatekeeper route is the typed Vercel function at
`api/agent.ts`. It approves only after local Groth16 verification and a
Kurier `Finalized` result.

This deployment targets **Proof Gatekeeper**.

- `src/hmac.ts`: raw-body HMAC verification and response signing.
- `src/gatekeeper-policy.ts`: deterministic Gatekeeper decision policy.
- `src/proof.ts`: official local Groth16 proving and verification.
- `src/kurier.ts`: Kurier submission and `Finalized` polling.
- `src/replay.ts`: durable proof reference tracking in Vercel Blob.

## Environment (Vercel production)

| var | source |
|---|---|
| `AGENT_GAMES_HMAC_SECRET` | dashboard Rotate Secret, pasted into Vercel by the owner |
| `STRATEGY_PARAMS`, `STRATEGY_SALT`, `STRATEGY_COMMITMENT` | `node scripts/strategy-setup.mjs 10,0,0,0,0,0,0,0 --push` (salt never printed; local copy `.env.strategy`) |
| `BLOB_READ_WRITE_TOKEN` | Blob store `agentgames-seen` |
| `GK_TASKID_ENCODING` | optional: `keccakModP` (default), `keccakShr8`, `utf8BigEndian`, `uuidTail`, `hexDigits` |
| `KURIER_API_KEY` | mainnet Kurier API key |
| `KURIER_BASE_URL` | `https://api.kurier.xyz/api/v1` |
| `KURIER_GATEKEEPER_VK_HASH` | official Gatekeeper VK hash; must not be changed |

## Run

Circuit artifacts are the organizer's files; fetch them into `artifacts/` first (URLs from `https://agentgames.zkverify.io/api/circuit-info`):

```sh
for f in gatekeeper.wasm gatekeeper_final.zkey vfy-policy.wasm vfy-policy_final.zkey; do curl -fsSo artifacts/$f https://agentgames.zkverify.io/circuits/$f; done
for c in gatekeeper vfy-policy; do npx snarkjs zkey export verificationkey artifacts/${c}_final.zkey artifacts/$c.vkey.json; done
npm ci
npm test            # transport, policy, gatekeeper proofs
npm run typecheck   # typed production route
npm run proofs      # official-circuit local verification report
vercel deploy --prod --yes
```

Order that avoids the platform's secret-decrypt trap: rotate secret → set env → redeploy → preflight → save the strategy commitment.
