{{- define "logsearch.name" -}}
logsearch
{{- end -}}

{{- define "logsearch.fullname" -}}
{{- printf "%s" (include "logsearch.name" .) -}}
{{- end -}}
