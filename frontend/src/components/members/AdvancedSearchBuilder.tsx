'use client';

import { useState } from 'react';

import type { SearchCondition, SearchQuery } from '../../types/domain';

interface AdvancedSearchBuilderProps {
  onApplyQuery: (query: SearchQuery | null) => void;
  onClose: () => void;
}

export default function AdvancedSearchBuilder({ onApplyQuery, onClose }: AdvancedSearchBuilderProps) {
  const [conditions, setConditions] = useState<SearchCondition[]>([
    { id: '1', field: 'name', operator: 'contains', value: '', logic: 'AND' }
  ]);

  const fieldOptions = [
    { value: 'name', label: 'Name' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
    { value: 'bio', label: 'Bio' },
    { value: 'roles', label: 'Role' },
    { value: 'engagement.engagementScore', label: 'Engagement Score' },
    { value: 'engagement.membershipStage', label: 'Membership Stage' },
    { value: 'engagement.riskLevel', label: 'Risk Level' },
    { value: 'createdAt', label: 'Join Date' },
    { value: 'lastLoginAt', label: 'Last Login' },
    { value: 'isActive', label: 'Active Status' }
  ];

  const operatorOptions = {
    text: [
      { value: 'contains', label: 'Contains' },
      { value: 'equals', label: 'Equals' },
      { value: 'starts_with', label: 'Starts with' },
      { value: 'ends_with', label: 'Ends with' },
      { value: 'not_contains', label: 'Does not contain' }
    ],
    number: [
      { value: 'equals', label: 'Equals' },
      { value: 'greater_than', label: 'Greater than' },
      { value: 'less_than', label: 'Less than' },
      { value: 'between', label: 'Between' }
    ],
    date: [
      { value: 'equals', label: 'On date' },
      { value: 'before', label: 'Before' },
      { value: 'after', label: 'After' },
      { value: 'between', label: 'Between' }
    ],
    select: [
      { value: 'equals', label: 'Is' },
      { value: 'not_equals', label: 'Is not' },
      { value: 'in', label: 'Is one of' }
    ]
  };

  const getFieldType = (field: string): keyof typeof operatorOptions => {
    if (field.includes('Date') || field.includes('At')) return 'date';
    if (field.includes('Score') || field.includes('Count')) return 'number';
    if (field.includes('Stage') || field.includes('Level') || field === 'roles' || field === 'isActive') return 'select';
    return 'text';
  };

  const addCondition = () => {
    const newCondition: SearchCondition = {
      id: Date.now().toString(),
      field: 'name',
      operator: 'contains',
      value: '',
      logic: 'AND'
    };
    setConditions([...conditions, newCondition]);
  };

  const updateCondition = (id: string, updates: Partial<SearchCondition>) => {
    setConditions(conditions.map(condition => 
      condition.id === id ? { ...condition, ...updates } : condition
    ));
  };

  const removeCondition = (id: string) => {
    setConditions(conditions.filter(condition => condition.id !== id));
  };

  const handleApply = () => {
    const validConditions = conditions.filter(c => c.value.trim() !== '');
    onApplyQuery({ conditions: validConditions, type: 'advanced' });
    onClose();
  };

  const handleClear = () => {
    onApplyQuery(null);
    onClose();
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-6 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">Advanced Search Builder</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-3">
        {conditions.map((condition, index) => (
          <div key={condition.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-md">
            {index > 0 && (
              <select
                value={condition.logic}
                onChange={(e) => updateCondition(condition.id, { logic: e.target.value as 'AND' | 'OR' })}
                className="px-2 py-1 text-sm border border-gray-300 rounded"
              >
                <option value="AND">AND</option>
                <option value="OR">OR</option>
              </select>
            )}

            <select
              value={condition.field}
              onChange={(e) => updateCondition(condition.id, { 
                field: e.target.value,
                operator: operatorOptions[getFieldType(e.target.value)][0].value
              })}
              className="px-3 py-2 border border-gray-300 rounded"
            >
              {fieldOptions.map(field => (
                <option key={field.value} value={field.value}>{field.label}</option>
              ))}
            </select>

            <select
              value={condition.operator}
              onChange={(e) => updateCondition(condition.id, { operator: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded"
            >
              {operatorOptions[getFieldType(condition.field)].map(op => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>

            {getFieldType(condition.field) === 'date' ? (
              <input
                type="date"
                value={condition.value}
                onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded"
              />
            ) : getFieldType(condition.field) === 'number' ? (
              <input
                type="number"
                value={condition.value}
                onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                placeholder="Enter number..."
                className="px-3 py-2 border border-gray-300 rounded"
              />
            ) : getFieldType(condition.field) === 'select' && condition.field === 'engagement.membershipStage' ? (
              <select
                value={condition.value}
                onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded"
              >
                <option value="">Select stage...</option>
                <option value="leader">Leader</option>
                <option value="core_member">Core Member</option>
                <option value="active_member">Active Member</option>
                <option value="new_member">New Member</option>
                <option value="visitor">Visitor</option>
                <option value="at_risk">At Risk</option>
                <option value="inactive">Inactive</option>
              </select>
            ) : getFieldType(condition.field) === 'select' && condition.field === 'engagement.riskLevel' ? (
              <select
                value={condition.value}
                onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded"
              >
                <option value="">Select risk level...</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            ) : getFieldType(condition.field) === 'select' && condition.field === 'isActive' ? (
              <select
                value={condition.value}
                onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded"
              >
                <option value="">Select status...</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            ) : (
              <input
                type="text"
                value={condition.value}
                onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                placeholder="Enter value..."
                className="px-3 py-2 border border-gray-300 rounded flex-1"
              />
            )}

            <button
              onClick={() => removeCondition(condition.id)}
              disabled={conditions.length === 1}
              className="text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-6">
        <button
          onClick={addCondition}
          className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Condition
        </button>

        <div className="flex space-x-3">
          <button
            onClick={handleClear}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            Clear Search
          </button>
          <button
            onClick={handleApply}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Apply Search
          </button>
        </div>
      </div>
    </div>
  );
}