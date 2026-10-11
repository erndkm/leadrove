import { Scissors, Wrench, Utensils, HeartPulse, ShoppingBag, BriefcaseBusiness, Hotel, Store } from 'lucide-react';
import './business-type.css';

const icons = { beauty: Scissors, trades: Wrench, food: Utensils, health: HeartPulse, retail: ShoppingBag, professional: BriefcaseBusiness, hospitality: Hotel };

export default function BusinessTypeLabel({ business }) {
  const Icon = icons[business.category] || Store;
  return <span className={`business-type type-${icons[business.category] ? business.category : 'retail'}`}><Icon size={13} aria-hidden="true" /><span>{business.kind || 'Business'}</span></span>;
}
