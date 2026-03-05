# Kubernetes Service Account Token Setup

This guide explains how to create a Kubernetes service account and token for the Homelab Dashboard to use instead of a kubeconfig file.

## Why Use a Service Account Token?

- **Simplified deployment**: No need to manage kubeconfig files
- **Better security**: Token can have limited, specific permissions
- **Service-oriented**: Designed for applications accessing the K8s API
- **Portable**: Easy to share across deployments

## Quick Setup

### 1. Create a Service Account

```bash
kubectl create serviceaccount homelab-dashboard -n default
```

### 2. Create a ClusterRole with Required Permissions

```bash
kubectl apply -f - <<EOF
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: homelab-dashboard-role
rules:
  # Node operations
  - apiGroups: [""]
    resources: ["nodes"]
    verbs: ["get", "list", "watch", "patch"]
  
  # Pod operations (for draining nodes)
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "delete"]
  
  # Deployment, StatefulSet, DaemonSet health checks
  - apiGroups: ["apps"]
    resources: ["deployments", "statefulsets", "daemonsets"]
    verbs: ["get", "list", "watch"]
  
  # Service operations
  - apiGroups: [""]
    resources: ["services"]
    verbs: ["get", "list", "watch"]
  
  # Pod eviction (for draining)
  - apiGroups: ["policy"]
    resources: ["poddisruptionbudgets"]
    verbs: ["get", "list"]
  
  - apiGroups: [""]
    resources: ["pods/eviction"]
    verbs: ["create"]
EOF
```

### 3. Bind the ClusterRole to the Service Account

```bash
kubectl create clusterrolebinding homelab-dashboard-binding \
  --clusterrole=homelab-dashboard-role \
  --serviceaccount=default:homelab-dashboard
```

### 4. Create a Long-Lived Token (Kubernetes 1.24+)

For Kubernetes 1.24 and later, tokens are no longer automatically generated:

```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: homelab-dashboard-token
  namespace: default
  annotations:
    kubernetes.io/service-account.name: homelab-dashboard
type: kubernetes.io/service-account-token
EOF
```

### 5. Retrieve the Token

```bash
# Get the token
kubectl get secret homelab-dashboard-token -n default -o jsonpath='{.data.token}' | base64 --decode

# Get the CA certificate (optional, for secure connections)
kubectl get secret homelab-dashboard-token -n default -o jsonpath='{.data.ca\.crt}'
```

### 6. Get Your Cluster API Server Address

```bash
kubectl cluster-info | grep "Kubernetes control plane"
```

This will show something like: `https://192.168.1.100:6443`

## Configuration

Add the following to your `config.json`:

```json
{
  "kubernetes": {
    "cluster": "https://192.168.1.100:6443",
    "token": "eyJhbGciOiJSUzI1NiIsImtpZCI6Ii...",
    "caData": "LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t...",
    "skipTLSVerify": false
  }
}
```

### Configuration Options

- **cluster** (required): Your Kubernetes API server URL
- **token** (required): The service account token from step 5
- **caData** (optional): Base64-encoded CA certificate for secure TLS verification
- **skipTLSVerify** (optional): Set to `true` to skip TLS verification (not recommended for production)

## Alternative: Using Default Kubeconfig

If you prefer to use your existing kubeconfig file, simply **omit** the `kubernetes` section from `config.json`:

```json
{
  "unifi": { ... },
  "healthChecks": [ ... ]
}
```

The application will automatically use `~/.kube/config` or the kubeconfig file specified in the `KUBECONFIG` environment variable.

## Namespace-Specific Permissions (Optional)

If you only want to grant access to specific namespaces instead of cluster-wide:

```bash
# Create Role (instead of ClusterRole) in specific namespace
kubectl apply -f - <<EOF
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: homelab-dashboard-role
  namespace: production
rules:
  - apiGroups: ["apps"]
    resources: ["deployments", "statefulsets", "daemonsets"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["pods", "services"]
    verbs: ["get", "list", "watch"]
EOF

# Create RoleBinding (instead of ClusterRoleBinding)
kubectl create rolebinding homelab-dashboard-binding \
  --role=homelab-dashboard-role \
  --serviceaccount=default:homelab-dashboard \
  --namespace=production
```

**Note**: With namespace-specific permissions, you won't be able to list/manage nodes cluster-wide or perform operations in other namespaces.

## Testing the Token

Test your token using curl:

```bash
TOKEN="your-token-here"
CLUSTER="https://192.168.1.100:6443"

# Test authentication
curl -k -H "Authorization: Bearer $TOKEN" "$CLUSTER/api/v1/nodes"
```

If successful, you should see JSON output with your node information.

## Security Best Practices

1. **Use TLS verification**: Always provide `caData` and keep `skipTLSVerify: false` in production
2. **Principle of least privilege**: Only grant permissions the dashboard actually needs
3. **Rotate tokens**: Periodically regenerate service account tokens
4. **Network security**: Restrict network access to the K8s API server
5. **Audit logs**: Enable Kubernetes audit logging to track API access

## Troubleshooting

### "Unauthorized" errors
- Verify the token is correct and not expired
- Check that the ClusterRoleBinding is properly configured
- Ensure the service account exists

### Connection refused
- Verify the cluster URL is correct
- Check firewall rules
- Ensure the API server is accessible from the Raspberry Pi

### Certificate errors
- Provide the correct `caData` value
- Or temporarily set `skipTLSVerify: true` for testing (not recommended for production)

## Cleanup

To remove the service account and permissions:

```bash
kubectl delete serviceaccount homelab-dashboard -n default
kubectl delete clusterrolebinding homelab-dashboard-binding
kubectl delete clusterrole homelab-dashboard-role
kubectl delete secret homelab-dashboard-token -n default
```
