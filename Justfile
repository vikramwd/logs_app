all: opensearch dashboard logtool

opensearch: 
	helm install opensearch helm/opensearch/. --namespace opensearch --create-namespace -f helm/opensearch/valuesNOSSL.yaml

dashboard: 
	helm install dashboards helm/opensearch-dashboards/. --namespace opensearch --create-namespace -f helm/opensearch-dashboards/valuesNOSSL.yaml

logtool: 
	helm install logtool helm/logsearch -n logging --create-namespace

build tag="latest":
	docker build -f logsearch-tool/Dockerfile.single -t vkramkumar/opensearch-logsearch:{{tag}} logsearch-tool
	docker push vkramkumar/opensearch-logsearch:{{tag}}
