import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, Save, X, Trash2 } from 'lucide-react';
import { expenseAPI } from '../services/api';

const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};

const ExpenseDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [expense, setExpense]             = useState(null);
  const [editedExpense, setEditedExpense] = useState(null);
  const [loading, setLoading]             = useState(true);
  const [editing, setEditing]             = useState(false);
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState(null);

  const [splitAssignments, setSplitAssignments] = useState({});
  const [newParticipantName, setNewParticipantName] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await expenseAPI.getExpenses(100, 0);
        const found = res.expenses?.find((e) => String(e.id) === String(id));
        if (!found) throw new Error('Expense not found');
        setExpense(found);
        setEditedExpense({ ...found });
        const assignments = {};
        found.items?.forEach((item) => {
          assignments[item.name] = found.participants
            ?.filter((p) => p.items?.includes(item.name))
            .map((p) => p.name) || [];
        });
        setSplitAssignments(assignments);
      } catch (err) {
        setError(err.message || 'Failed to load expense');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const allParticipants = useMemo(() => {
    if (!editedExpense?.participants) return [];
    return [...new Set(editedExpense.participants.map((p) => p.name))];
  }, [editedExpense]);

  const splitAmounts = useMemo(() => {
    if (!editedExpense?.items) return {};
    const amounts = {};
    allParticipants.forEach((name) => { amounts[name] = 0; });
    editedExpense.items.forEach((item) => {
      const assignees = splitAssignments[item.name] || [];
      if (assignees.length === 0) return;
      const share = toNum(item.price) / assignees.length;
      assignees.forEach((name) => { amounts[name] = (amounts[name] || 0) + share; });
    });
    return amounts;
  }, [splitAssignments, editedExpense, allParticipants]);

  const participantAmounts = useMemo(() => {
    if (!expense?.participants || !expense?.items) return {};
    const amounts = {};
    expense.participants.forEach((p) => {
      let total = 0;
      (p.items || []).forEach((itemName) => {
        const shareCount = expense.participants.filter((pp) => pp.items?.includes(itemName)).length;
        const item = expense.items.find((i) => i.name === itemName);
        if (item && shareCount > 0) total += toNum(item.price) / shareCount;
      });
      amounts[p.name] = total;
    });
    return amounts;
  }, [expense]);

  const itemParticipants = useMemo(() => {
    if (!expense?.participants || !expense?.items) return {};
    const map = {};
    expense.items.forEach((item) => {
      map[item.name] = expense.participants
        .filter((p) => p.items?.includes(item.name))
        .map((p) => p.name);
    });
    return map;
  }, [expense]);

  const toggleAssignment = (itemName, participantName) => {
    setSplitAssignments((prev) => {
      const current = prev[itemName] || [];
      return {
        ...prev,
        [itemName]: current.includes(participantName)
          ? current.filter((n) => n !== participantName)
          : [...current, participantName],
      };
    });
  };

  const addParticipant = () => {
    const name = newParticipantName.trim();
    if (!name || allParticipants.includes(name)) return;
    setEditedExpense((prev) => ({
      ...prev,
      participants: [...(prev.participants || []), { name, items: [] }],
    }));
    setNewParticipantName('');
  };

  const removeParticipant = (name) => {
    setEditedExpense((prev) => ({
      ...prev,
      participants: prev.participants.filter((p) => p.name !== name),
    }));
    setSplitAssignments((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((item) => { next[item] = next[item].filter((n) => n !== name); });
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updatedParticipants = allParticipants.map((name) => ({
        name,
        items: Object.entries(splitAssignments)
          .filter(([, assignees]) => assignees.includes(name))
          .map(([itemName]) => itemName),
      }));
      const updated = { ...editedExpense, participants: updatedParticipants };
      setExpense(updated);
      setEditedExpense(updated);
      setEditing(false);
      alert('Expense updated locally! (Full API save pending)');
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedExpense({ ...expense });
    const assignments = {};
    expense.items?.forEach((item) => {
      assignments[item.name] = expense.participants
        ?.filter((p) => p.items?.includes(item.name))
        .map((p) => p.name) || [];
    });
    setSplitAssignments(assignments);
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this expense?')) return;
    try {
      await expenseAPI.deleteExpense(id);
      navigate('/dashboard');
    } catch (e) {
      setError(e.message || 'Delete failed');
    }
  };

  const handleItemChange = (idx, field, val) => {
    const items = [...editedExpense.items];
    if (field === 'price')         items[idx][field] = toNum(val);
    else if (field === 'quantity') items[idx][field] = Math.max(1, parseInt(val, 10) || 1);
    else                           items[idx][field] = val;
    setEditedExpense({ ...editedExpense, items });
  };

  const handleAddItem = () =>
    setEditedExpense({ ...editedExpense, items: [...(editedExpense.items || []), { name: '', price: 0, quantity: 1 }] });

  const handleRemoveItem = (idx) =>
    setEditedExpense({ ...editedExpense, items: editedExpense.items.filter((_, i) => i !== idx) });

  if (loading) return <div className="max-w-5xl mx-auto px-6 py-12 text-center text-gray-500">Loading expense...</div>;
  if (error && !expense) return (
    <div className="max-w-5xl mx-auto px-6 py-12 text-center">
      <p className="text-red-600 mb-4">{error}</p>
      <button onClick={() => navigate('/dashboard')} className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"><ArrowLeft size={16} /> Back to Dashboard</button>
    </div>
  );

  const display = editing ? editedExpense : expense;
  const fmt = (v) => toNum(v).toFixed(2);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate('/dashboard')} className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"><ArrowLeft size={16} /> Back</button>
        <div className="flex items-center gap-3">
          {!editing ? (
            <>
              <button onClick={() => setEditing(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Edit size={16} /> Edit</button>
              <button onClick={handleDelete} className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"><Trash2 size={16} /> Delete</button>
            </>
          ) : (
            <>
              <button onClick={handleCancel} className="inline-flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"><X size={16} /> Cancel</button>
              <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60"><Save size={16} /> {saving ? 'Saving...' : 'Save'}</button>
            </>
          )}
        </div>
      </div>

      {error && <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-600 rounded-lg">{error}</div>}

      <div className="space-y-6">
        {/* Details */}
        <section className="bg-white rounded-xl shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Expense Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Store Name</label>
              {editing ? <input value={display.store_name || ''} onChange={(e) => setEditedExpense({ ...editedExpense, store_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /> : <div className="text-gray-900">{display.store_name || 'N/A'}</div>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Total Amount</label>
              {editing ? <input type="number" step="0.01" value={display.total_amount || ''} onChange={(e) => setEditedExpense({ ...editedExpense, total_amount: toNum(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /> : <div className="text-gray-900 font-semibold">${fmt(display.total_amount)}</div>}
            </div>
            {display.subtotal != null && <div><label className="block text-sm font-medium text-gray-700 mb-1">Subtotal</label>{editing ? <input type="number" step="0.01" value={display.subtotal || ''} onChange={(e) => setEditedExpense({ ...editedExpense, subtotal: toNum(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /> : <div className="text-gray-900">${fmt(display.subtotal)}</div>}</div>}
            {display.tax_amount != null && <div><label className="block text-sm font-medium text-gray-700 mb-1">Tax Amount</label>{editing ? <input type="number" step="0.01" value={display.tax_amount || ''} onChange={(e) => setEditedExpense({ ...editedExpense, tax_amount: toNum(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /> : <div className="text-gray-900">${fmt(display.tax_amount)}</div>}</div>}
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Created At</label><div className="text-gray-900">{new Date(display.created_at).toLocaleString()}</div></div>
          </div>
          {display.transcript && <div className="mt-4"><label className="block text-sm font-medium text-gray-700 mb-1">Voice Transcript</label><div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-600 italic">{display.transcript}</div></div>}
        </section>

        {/* Items */}
        <section className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Items ({display.items?.length || 0})</h2>
            {editing && <button onClick={handleAddItem} className="px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm">+ Add Item</button>}
          </div>
          {display.items?.length ? (
            <div className="space-y-3">
              {display.items.map((item, idx) => (
                <div key={idx} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  {editing ? (
                    <div className="flex items-center gap-3">
                      <input value={item.name} onChange={(e) => handleItemChange(idx, 'name', e.target.value)} placeholder="Item name" className="flex-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <input type="number" step="0.01" value={item.price} onChange={(e) => handleItemChange(idx, 'price', e.target.value)} placeholder="Price" className="flex-1 px-3 py-2 border border-gray-300 rounded-lg" />
                      <input type="number" min="1" value={item.quantity} onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)} placeholder="Qty" className="w-20 px-3 py-2 border border-gray-300 rounded-lg" />
                      <button onClick={() => handleRemoveItem(idx)} className="w-8 h-8 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center justify-center">×</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{item.name}</div>
                        {itemParticipants[item.name]?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {itemParticipants[item.name].map((name) => (
                              <span key={name} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">{name}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-gray-500 text-sm">Qty: {item.quantity}</div>
                      <div className="font-semibold text-emerald-600">${fmt(item.price)}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : <div className="text-center py-10 text-gray-400">No items in this expense</div>}
        </section>

        {/* Bill Split — editing mode */}
        {editing && (
          <section className="bg-white rounded-xl shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Bill Split</h2>
            <div className="flex gap-2 mb-6">
              <input
                type="text"
                placeholder="Add participant name"
                value={newParticipantName}
                onChange={(e) => setNewParticipantName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addParticipant(); }}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={addParticipant} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">+ Add</button>
            </div>
            <div className="space-y-4">
              {editedExpense.items?.map((item) => (
                <div key={item.name} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-medium text-gray-900">{item.name}</span>
                    <span className="text-emerald-600 font-semibold">${fmt(item.price)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {allParticipants.map((name) => {
                      const checked = (splitAssignments[item.name] || []).includes(name);
                      return (
                        <label key={name} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm cursor-pointer border transition ${checked ? 'bg-blue-100 border-blue-500 text-blue-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100'}`}>
                          <input type="checkbox" checked={checked} onChange={() => toggleAssignment(item.name, name)} className="hidden" />
                          {name}
                          {checked && (splitAssignments[item.name] || []).length > 1 && (
                            <span className="text-xs opacity-70">(${(toNum(item.price) / (splitAssignments[item.name] || []).length).toFixed(2)})</span>
                          )}
                        </label>
                      );
                    })}
                    {allParticipants.length === 0 && <span className="text-sm text-gray-400">Add participants above</span>}
                  </div>
                </div>
              ))}
            </div>
            {allParticipants.length > 0 && (
              <div className="mt-6 pt-4 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Summary</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {allParticipants.map((name) => (
                    <div key={name} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{name}</span>
                        <button onClick={() => removeParticipant(name)} className="text-gray-400 hover:text-red-500 text-xs">×</button>
                      </div>
                      <span className="font-bold text-emerald-600">${toNum(splitAmounts[name]).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Participants — read-only */}
        {!editing && display.participants?.length > 0 && (
          <section className="bg-white rounded-xl shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Participants ({display.participants.length})</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {display.participants.map((p, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="font-semibold text-gray-900">{p.name}</div>
                  <div className="text-lg font-bold text-emerald-600">${toNum(participantAmounts[p.name]).toFixed(2)}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default ExpenseDetail;