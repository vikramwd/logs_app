pipeline {
  agent {
    kubernetes {
      yaml """
apiVersion: v1
kind: Pod
spec:
  serviceAccountName: default
  containers:
    - name: kaniko
      image: gcr.io/kaniko-project/executor:debug
      command: ["sleep"]
      args: ["infinity"]
      volumeMounts:
        - name: docker-config
          mountPath: /kaniko/.docker
    - name: helm
      image: alpine/helm:3.14.0
      command: ["sleep"]
      args: ["infinity"]
  volumes:
    - name: docker-config
      secret:
        secretName: docker-config
        items:
          - key: .dockerconfigjson
            path: config.json
"""
    }
  }

  environment {
    GIT_URL = 'https://github.com/vikramwd/logtool.git'
    GIT_CREDENTIALS_ID = 'gh_pat'
    IMAGE_NAME = 'vkramkumar/opensearch-logsearch'
    BUILD_CONTEXT = 'logtool'
    DOCKERFILE = 'logtool/Dockerfile.single'
    RELEASE_NAME = 'logsearch'
    CHART_DIR = 'helm/logsearch'
    VALUES_FILE = 'helm/logsearch/values.yaml'
    KUBE_CONTEXT = ''
  }

  stages {
    stage('Checkout') {
      steps {
        checkout([
          $class: 'GitSCM',
          branches: [[name: '*/main']],
          userRemoteConfigs: [[url: env.GIT_URL, credentialsId: env.GIT_CREDENTIALS_ID]]
        ])
      }
    }

    stage('Build + Push (Kaniko)') {
      steps {
        container('kaniko') {
          sh '''
            set -e
            TAG="v${BUILD_NUMBER}"
            find ${WORKSPACE}/${BUILD_CONTEXT} -type d -name node_modules -prune -exec rm -rf {} +
            find ${WORKSPACE}/${BUILD_CONTEXT} -type d -name dist -prune -exec rm -rf {} +
            /kaniko/executor \
              --dockerfile ${WORKSPACE}/${DOCKERFILE} \
              --context ${WORKSPACE}/${BUILD_CONTEXT} \
              --destination ${IMAGE_NAME}:${TAG} \
              --ignore-path=/product_uuid
          '''
        }
      }
    }

    stage('Deploy Helm') {
      steps {
        container('helm') {
          sh '''
            set -e
            TAG="v${BUILD_NUMBER}"
            CTX=""
            if [ -n "${KUBE_CONTEXT}" ]; then
              CTX="--kube-context ${KUBE_CONTEXT}"
            fi
            RAND_RAW=$(od -An -N2 -tu2 /dev/urandom | tr -d ' ')
            NODEPORT=$((30000 + (RAND_RAW % 2768)))
            helm upgrade --install ${RELEASE_NAME} ${CHART_DIR} \
              -f ${VALUES_FILE} \
              --set image.repository=${IMAGE_NAME} \
              --set image.tag=${TAG} \
              --set service.nodePort=${NODEPORT} \
              ${CTX}
          '''
        }
      }
    }
  }
}
