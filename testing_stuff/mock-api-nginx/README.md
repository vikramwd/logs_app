# Nginx API (Kubernetes)

This deployment serves one dummy profile at `/api/profile` and ships access logs to OpenSearch via Vector.

- Default: `/api/profile` returns a random profile (1–100).
- Optional: `/api/profile?id=42` returns profile 42.

Vector sink:
- OpenSearch: `http://opensearch-cluster-master:9200`
- Index: `logtool`

## Apply

```
kubectl apply -f nginx-api/configmap.yaml --validate=false
kubectl apply -f nginx-api/vector-configmap.yaml --validate=false
kubectl apply -f nginx-api/deployment.yaml --validate=false
kubectl apply -f nginx-api/service.yaml --validate=false
```

## Test (port-forward)

```
kubectl port-forward svc/nginx-api 8081:80
curl http://localhost:8081/api/profile
curl "http://localhost:8081/api/profile?id=42"
```
