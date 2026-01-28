# 🔍 LogSearch – Custom Google-like UI for OpenSearch

A lightweight, user-friendly web interface to search and explore logs stored in **OpenSearch**, with a clean, modern UI inspired by Google Search.

How It Works Right Now
In your App.tsx file, there’s this section:
You see these 3 options by default
They match common log naming patterns (like those from Vector, Filebeat, or custom apps)
The app uses whatever you select to build the OpenSearch URL:
Will it break if an index doesn’t exist?  NO


http://localhost:9200/<your-pattern>/_search
frontend/src/App.tsx
<select>
  <option value="vector-*">vector-*</option>
  <option value="app-logs-*">app-logs-*</option>
  <option value="*">All Indices</option>
</select>