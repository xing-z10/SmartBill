import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Receipt, DollarSign, Users, TrendingUp, Plus, FileText, Trash2, Share2, Eye
} from 'lucide-react';
import { expenseAPI } from '../services/api';
import authService from '../services/authService';
import SplitBillModal from '../components/SplitBillModal';

export default function Dashboard() {
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState([]);
  const [sharedExpenses, setSharedExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('my');
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [stats, setStats] = useState({
    myOwed: 0,
    totalAmount: 0,
    activeParticipants: 0,
    avgOwed: 0,
  });

  const [showAll, setShowAll] = useState(false);
  const DISPLAY_COUNT = 3;

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [myRes, sharedRes] = await Promise.all([
          expenseAPI.getExpenses(50, 0),
          expenseAPI.getSharedExpenses(50, 0),
        ]);
        const my = myRes.expenses || [];
        const shared = sharedRes.expenses || [];
        setExpenses(my);
        setSharedExpenses(shared);

        const userEmail = authService.getCurrentUser()?.email;

        // 所有账单总额（我创建的）
        const totalAmount = my.reduce((s, e) => s + Number(e.total_amount || 0), 0);

        // 计算某个 expense 里当前用户需要支付的金额
        const calcMyShare = (e) => {
          let share = 0;
          // 找到匹配当前用户的 participant（优先用 email 匹配）
          const me = e.participants?.find((p) => {
            if (p.email && userEmail) {
              return p.email.toLowerCase() === userEmail.toLowerCase();
            }
            // fallback：如果是自己创建的账单，me (You) 就是自己
            return p.name === 'me (You)' || p.name === 'me';
          });
          if (me && e.items) {
            (me.items || []).forEach((itemName) => {
              const shareCount = e.participants.filter((pp) => pp.items?.includes(itemName)).length;
              const item = e.items.find((i) => i.name === itemName);
              if (item && shareCount > 0) share += Number(item.price || 0) / shareCount;
            });
          }
          return share;
        };

        // 我在自己账单里的份额 + shared 账单里的份额
        const myOwed = [...my, ...shared].reduce((s, e) => s + calcMyShare(e), 0);

        // 所有参与者去重
        const participants = new Set();
        my.forEach((e) => e.participants?.forEach((p) => participants.add(p.name)));

        // 平均每笔账单我需要支付的金额（含 shared）
        const totalBills = my.length + shared.length;
        const avgOwed = totalBills ? myOwed / totalBills : 0;

        setStats({
          myOwed,
          totalAmount,
          activeParticipants: participants.size,
          avgOwed,
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleDeleteExpense = async (id, name) => {
    if (!window.confirm(`Delete expense from ${name || 'Unknown Store'}?`)) return;
    try {
      await expenseAPI.deleteExpense(id);
      setExpenses((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      alert('Delete failed');
    }
  };

  const handleSplitBill = (exp) => {
    setSelectedExpense(exp);
    setIsSplitModalOpen(true);
  };

  const displayExpenses = activeTab === 'my' ? expenses : sharedExpenses;

  const statCards = [
    { icon: <DollarSign size={24} />, value: `$${stats.myOwed.toFixed(2)}`, label: 'My Total Owed', color: 'bg-blue-600' },
    { icon: <Receipt size={24} />, value: `$${stats.totalAmount.toFixed(2)}`, label: 'Total Amount', color: 'bg-emerald-600' },
    { icon: <Users size={24} />, value: stats.activeParticipants, label: 'Active Participants', color: 'bg-purple-600' },
    { icon: <TrendingUp size={24} />, value: `$${stats.avgOwed.toFixed(2)}`, label: 'Avg. I Owe per Bill', color: 'bg-orange-600' },
  ];

  const visibleList = showAll ? displayExpenses : displayExpenses.slice(0, DISPLAY_COUNT);

  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <button
          onClick={() => navigate('/new-expense')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus size={20} /> New Expense
        </button>
      </div>
      <p className="text-gray-500 mb-6">Welcome back! Here's your expense overview.</p>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((s, i) => (
          <div key={i} className="bg-white rounded-xl shadow p-6 flex items-center gap-4">
            <div className={`w-12 h-12 ${s.color} text-white rounded-lg flex items-center justify-center`}>{s.icon}</div>
            <div>
              <div className="text-sm text-gray-500">{s.label}</div>
              <div className="text-2xl font-bold text-gray-900">{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Expenses Card */}
      <div className="bg-white rounded-xl shadow">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Expenses</h2>
          <div className="flex gap-2">
            {['my', 'shared'].map((t) => (
              <button
                key={t}
                onClick={() => { setActiveTab(t); setShowAll(false); }}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition ${activeTab === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
              >
                {t === 'my' ? `My Expenses (${expenses.length})` : `Shared with Me (${sharedExpenses.length})`}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-10 text-gray-500">Loading expenses...</div>
          ) : displayExpenses.length === 0 ? (
            <div className="text-center py-10">
              <Receipt className="mx-auto text-gray-300 mb-3" size={48} />
              <div className="text-gray-700 font-medium">
                {activeTab === 'my' ? 'No expenses yet' : 'No shared expenses yet'}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {activeTab === 'my' ? 'Create your first expense to get started' : "When friends split bills with you, they'll appear here"}
              </p>
              {activeTab === 'my' && (
                <button onClick={() => navigate('/new-expense')} className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  Create Your First Expense
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {visibleList.map((exp) => (
                  <div key={exp.id} className="relative bg-white border border-gray-200 rounded-lg p-4 hover:shadow transition">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 cursor-pointer" onClick={() => navigate(`/expense/${exp.id}`)}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-gray-900">{exp.store_name || 'Unknown Store'}</span>
                          <span className="text-lg font-bold text-emerald-600">${Number(exp.total_amount).toFixed(2)}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                          <span>{new Date(exp.created_at).toLocaleDateString()}</span>
                          {exp.items?.length > 0 && <span>{exp.items.length} items</span>}
                          {exp.transcript && <span className="italic text-gray-400">{exp.transcript.slice(0, 50)}…</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4" onClick={(e) => e.stopPropagation()}>
                        {activeTab === 'my' && (
                          <>
                            <button onClick={() => handleSplitBill(exp)} className="inline-flex items-center gap-1 px-3 py-1.5 border border-blue-600 text-blue-600 rounded-md hover:bg-blue-50">
                              <Share2 size={16} /> Split
                            </button>
                            <button onClick={() => handleDeleteExpense(exp.id, exp.store_name)} className="inline-flex items-center gap-1 px-3 py-1.5 border border-red-200 text-red-600 rounded-md hover:bg-red-50">
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                        {activeTab === 'shared' && (
                          <button onClick={() => navigate(`/expense/${exp.id}`)} className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50">
                            <Eye size={16} /> View
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {displayExpenses.length > DISPLAY_COUNT && (
                <div className="mt-4 text-center">
                  <button onClick={() => setShowAll((v) => !v)} className="px-4 py-2 text-sm text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50">
                    {showAll ? 'Show less' : `Show all (${displayExpenses.length})`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
        <button onClick={() => navigate('/new-expense')} className="bg-white border border-gray-200 rounded-xl p-6 text-left hover:shadow transition">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-3"><Plus size={24} /></div>
          <h3 className="font-semibold text-gray-900 mb-1">Create Expense</h3>
          <p className="text-sm text-gray-500">Upload a bill and split expenses with AI</p>
        </button>
        <button onClick={() => navigate('/participants')} className="bg-white border border-gray-200 rounded-xl p-6 text-left hover:shadow transition">
          <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center mb-3"><Users size={24} /></div>
          <h3 className="font-semibold text-gray-900 mb-1">Manage Contacts</h3>
          <p className="text-sm text-gray-500">Add friends to split bills with</p>
        </button>
        <button onClick={() => navigate('/history')} className="bg-white border border-gray-200 rounded-xl p-6 text-left hover:shadow transition">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center mb-3"><FileText size={24} /></div>
          <h3 className="font-semibold text-gray-900 mb-1">View History</h3>
          <p className="text-sm text-gray-500">Browse all past expenses and splits</p>
        </button>
      </div>

      {isSplitModalOpen && selectedExpense && (
        <SplitBillModal
          isOpen={isSplitModalOpen}
          onClose={() => { setIsSplitModalOpen(false); setSelectedExpense(null); }}
          expense={selectedExpense}
          onSuccess={() => window.location.reload()}
        />
      )}
    </main>
  );
}