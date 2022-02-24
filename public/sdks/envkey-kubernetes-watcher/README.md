# envkey-kubernetes-watcher

A watcher for any Kubernetes cluster that automatically initiates a rolling upgrade on Deployments/StatefulSets/DaemonSets whenever an associated EnvKey environment is updated.

It also keeps track of the ENVKEYs in your cluster--it starts watching new ones automatically and stops watching any that are removed.

## Deploy to a cluster with Kustomize

```bash
kubectl apply -k https://github.com/envkey/envkey/public/sdks/envkey-kubernetes-watcher
```

## Usage

1. When setting an `ENVKEY` in your cluster, create a secret for it and give it a name (`envkey-app-name.environment-name` is a good pattern to follow).

```bash
kubectl create secret generic core-api.production \
  --from-literal=ENVKEY=YOUR-ENVKEY
```

_Make sure you don't commit your ENVKEYs to version control._

2. Expose any secrets set in the previous step as `ENVKEY` environment variables to the appropriate containers:

```yaml
containers:
  - name: core-api-container
    image: core-api
    env:
      - name: ENVKEY
        valueFrom:
          secretKeyRef:
            name: core-api.production
            key: ENVKEY
```

3. In your Docker containers, [install envkey-source](https://docs-v2.envkey.com/docs/envkey-source) and use it to execute any processes with your EnvKey config:

```dockerfile
FROM node:16-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN apk --no-cache add curl bash minisign

# Verify and install envkey-source
RUN VERSION=$(curl https://envkey-releases.s3.amazonaws.com/latest/envkeysource-version.txt) && ARTIFACT_URL=https://envkey-releases.s3.amazonaws.com/envkeysource/release_artifacts/$VERSION/install.sh && curl -O $ARTIFACT_URL -O $ARTIFACT_URL.minisig && { minisign -Vm install.sh -P "RWQ5lgVbbidOxaoIEsqZjbI6hHdS5Ri/SrDk9rNFFgiQZ4COuk6Li2HK" || { rm install.sh && install.sh.minisig &&  echo "Error: install.sh signature invalid. Exiting with error." >&2; exit 1; }; } && chmod +x install.sh && ./install.sh

EXPOSE 8081

CMD envkey-source -e 'node server.js'
```

The watcher will watch for changes on the environments of any ENVKEYs you've set, and initiate a rolling upgrade of any associated Deployments, DaemonSets, or StatefulSets when there's an update.

If you add or remove ENVKEYS, the watcher will pick up the changes automatically once they're applied to the cluster.

If you _don't_ want a particular Deployment, DaemonSet, or StatefulSet to be watched, add the following label to it: `watcher.envkey.com/ignore: true`.
