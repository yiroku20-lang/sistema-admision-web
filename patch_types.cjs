const fs = require('fs');
let content = fs.readFileSync('types.ts', 'utf-8');

content = content.replace(
`export interface BudgetItem {
  id: string;
  rubro: string;
  detalle: string;
  condicion: string;
  cantidad: number;
  costo_unitario: number;
  total: number;
}`,
`export interface BudgetRole {
  id: string;
  rubro: string;
  category: string;
  subcategory: string;
  role: string;
  condition: string;
  indicator: number;
  quantity: number;
  unit_cost: number;
  total: number;
}`
);

content = content.replace('items: BudgetItem[];', 'items: BudgetRole[];');
fs.writeFileSync('types.ts', content);
console.log('types.ts patched');
