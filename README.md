# Open Food Facts EU Mirror

A production-ready Kubernetes mirror for [Open Food Facts](https://world.openfoodfacts.org) - data dumps, API v2/v3, and daily delta sync. Running in EU (Frankfurt + Gravelines).

> Data is provided under the [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/1.0/). Source: [Open Food Facts](https://world.openfoodfacts.org).

---

## Live Services

| Service | URL | Description |
|---|---|---|
| **Data Mirror** | [data.off.wanna.community](https://data.off.wanna.community) | MongoDB dump, JSONL, CSV, daily deltas |
| **API Mirror** | [api.off.wanna.community](https://api.off.wanna.community) | OFF-compatible REST API v2 & v3 |
| **Status Page** | [status.off.wanna.community](https://status.off.wanna.community) | Uptime monitoring |

---

## What's Inside

```
apps/
├── offmirror/       # nginx file server + daily sync CronJob + MongoDB
│   ├── cronjob.yaml             # daily wget sync from static.openfoodfacts.org
│   ├── cronjob-deltaimport.yaml # daily mongoimport of delta files
│   ├── statefulset-mongo.yaml   # standalone MongoDB for OFF data
│   ├── job-mongorestore.yaml    # one-time full dump restore
│   └── deployment.yaml          # nginx serving data files
├── offapi/          # Node.js REST API (OFF v2 & v3 compatible)
└── gatus/           # status page monitoring OFF + mirror endpoints

argocd/              # ArgoCD Application manifests
```

---

## API Usage

Fully compatible with the [Open Food Facts API](https://openfoodfacts.github.io/openfoodfacts-server/api/).

### Get product by barcode

```bash
# API v2
curl https://api.off.wanna.community/api/v2/product/3017620422003

# API v3
curl https://api.off.wanna.community/api/v3/product/3017620422003

# Specific fields only
curl "https://api.off.wanna.community/api/v2/product/3017620422003?fields=code,product_name,nutriments"
```

### Search

```bash
curl "https://api.off.wanna.community/api/v2/search?code=3017620422003,737628064502"
```

### Rate limiting

60 requests/minute per IP. Please include a `User-Agent` header identifying your app:

```
User-Agent: YourAppName/1.0
```

---

## Data Sync Schedule

| Time (UTC) | Job | Description |
|---|---|---|
| 03:00 | `offmirror-sync` | Download updated dumps & deltas from OFF |
| 04:00 | `offmirror-deltaimport` | Import new delta files into MongoDB |

Data files available:
- `openfoodfacts-mongodbdump.gz` - full MongoDB dump (~14GB)
- `openfoodfacts-products.jsonl.gz` - JSONL export (~11GB)
- `en.openfoodfacts.org.products.csv.gz` - CSV export
- `delta/` - daily delta exports (last 14 days)

---

## Deploy Your Own

### Requirements

- Kubernetes cluster
- ArgoCD
- cert-manager with a ClusterIssuer `letsencrypt-prod`
- nginx ingress controller

### Steps

1. Fork this repository
2. Update domain names in `apps/*/ingress.yaml`
3. Update `repoURL` in `argocd/*.yaml` to your fork
4. Apply ArgoCD applications:

```bash
kubectl apply -f argocd/offmirror.yaml
kubectl apply -f argocd/offapi.yaml
kubectl apply -f argocd/gatus.yaml
```

5. Run initial data restore (after sync CronJob completes):

```bash
kubectl apply -f apps/offmirror/job-mongorestore.yaml
kubectl logs -n offmirror job/off-mongorestore -f
```

---

## Stack

- **Kubernetes** + **ArgoCD** (GitOps)
- **MongoDB 8** - stores full OFF product database
- **Node.js / Express** - REST API
- **nginx** - serves data dump files
- **Gatus** - status page & monitoring
- **cert-manager** - automatic TLS

---

## License

- **Code**: MIT
- **Data**: [ODbL](https://opendatacommons.org/licenses/odbl/1.0/) - Open Food Facts
