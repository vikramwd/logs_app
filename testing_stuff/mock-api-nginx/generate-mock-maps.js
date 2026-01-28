#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, 'MOCK_DATA.yaml');
const outputPath = path.join(__dirname, 'mock-maps.conf');

const raw = fs.readFileSync(inputPath, 'utf8');
const lines = raw.split(/\r?\n/);

const entries = [];
let current = null;

for (const line of lines) {
  if (!line.trim()) continue;
  if (line.startsWith('- id:')) {
    if (current) entries.push(current);
    const id = Number(line.split(':')[1].trim());
    current = { id };
    continue;
  }
  if (!current) continue;
  const match = line.match(/^\s+([^:]+):\s*(.*)$/);
  if (!match) continue;
  const key = match[1].trim();
  let value = match[2].trim();
  if (!value || value === 'null') {
    value = '';
  } else if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
  }
  current[key] = value;
}
if (current) entries.push(current);

const fields = [
  'email',
  'first_name',
  'last_name',
  'name',
  'gender',
  'ip_address',
  'phone',
  'city',
  'birthday_month',
  'age',
  'address',
  'digital_id',
  'education',
  'marital_status',
  'employment_status',
  'blood_group',
  'country',
  'state',
  'postal_code',
  'health_id'
];

const escapeValue = (value) =>
  String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');

let output = '';
for (const field of fields) {
  output += `map $mock_id $mock_${field} {\n`;
  output += '  default "";\n';
  for (const entry of entries) {
    if (!entry || !entry.id) continue;
    const value = escapeValue(entry[field]);
    output += `  ${entry.id} "${value}";\n`;
  }
  output += '}\n\n';
}

fs.writeFileSync(outputPath, output, 'utf8');
console.log(`Wrote ${outputPath}`);
