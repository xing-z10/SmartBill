import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, MicOff } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import StepIndicator from '../components/StepIndicator';
import UploadArea from '../components/UploadArea';
import { ocrAPI, sttAPI, expenseAPI, contactGroupsAPI, contactsAPI } from '../services/api';
import { STEPS } from '../constants';
import authService from '../services/authService';

const NewExpense = () => {
  const navigate = useNavigate();

  /* ---------- 步骤顺序 ---------- */
  const [activeStep, setActiveStep] = useState(1);
  const topRef = useRef(null);

  /* ---------- Step 1 状态 ---------- */
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);
  const [error, setError] = useState('');
  const [autoCalculate, setAutoCalculate] = useState(true);
  const [manualTotal, setManualTotal] = useState('');

  /* ---------- Step 2 语音 ---------- */
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [sttResult, setSttResult] = useState(null);
  const [sttLoading, setSttLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  /* ---------- Step 4 分摊 ---------- */
  const [itemAssignments, setItemAssignments] = useState({});
  const [participants, setParticipants] = useState([]);
  const [step4Initialized, setStep4Initialized] = useState(false);

  /* ---------- 群组 & 联系人 ---------- */
  const [contactGroups, setContactGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [contacts, setContacts] = useState([]);

  /* ---------- 生命周期 ---------- */
  useEffect(() => {
    if (authService.isAuthenticated()) {
      loadContactGroups();
      loadContacts();
    }
  }, []);

  // 步骤切换时自动滚动到顶部
  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [activeStep]);

  const loadContactGroups = async () => {
    try {
      const res = await contactGroupsAPI.getContactGroups();
      setContactGroups(res.groups || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadContacts = async () => {
    try {
      const res = await contactsAPI.getContacts();
      setContacts(res.contacts || []);
    } catch (err) {
      console.error(err);
    }
  };

  /* ---------- Step 1 上传 ---------- */
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setOcrResult(null);
      setError(null);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setOcrResult(null);
    setError(null);
  };

  const handleProcessReceipt = async () => {
    if (!selectedFile) return setError('Please select a file first');
    setLoading(true);
    setError(null);
    try {
      const result = await ocrAPI.uploadReceipt(selectedFile);
      setOcrResult({
        ...result,
        total: result.total ?? (manualTotal ? parseFloat(manualTotal) : null),
      });
      setActiveStep(2);
    } catch (err) {
      setError(err.message || 'Failed to process receipt');
    } finally {
      setLoading(false);
    }
  };

  const roundToTwo = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

  const recalculateFinancials = useCallback((items, currentTaxAmount) => {
    if (!items || items.length === 0) {
      return { subtotal: 0, total: roundToTwo(parseFloat(currentTaxAmount) || 0) };
    }
    const newSubtotal = items.reduce((sum, item) => {
      const price = parseFloat(item.price) || 0;
      const quantity = parseInt(item.quantity) || 1;
      return roundToTwo(sum + price * quantity);
    }, 0);
    const taxAmount = parseFloat(currentTaxAmount) || 0;
    return { subtotal: newSubtotal, total: roundToTwo(newSubtotal + taxAmount) };
  }, []);

  const handleItemChange = (idx, field, val) => {
    const items = [...ocrResult.items];
    if (field === 'price') items[idx][field] = parseFloat(val) || 0;
    else if (field === 'quantity') items[idx][field] = Math.max(1, parseInt(val, 10) || 1);
    else items[idx][field] = val;

    if (autoCalculate) {
      const financials = recalculateFinancials(items, ocrResult.tax_amount);
      setOcrResult({ ...ocrResult, items, ...financials });
    } else {
      setOcrResult({ ...ocrResult, items });
    }
  };

  const handleAddItem = () => {
    const newItems = [...(ocrResult.items || []), { name: '', price: 0, quantity: 1 }];
    if (autoCalculate) {
      const financials = recalculateFinancials(newItems, ocrResult.tax_amount);
      setOcrResult({ ...ocrResult, items: newItems, ...financials });
    } else {
      setOcrResult({ ...ocrResult, items: newItems });
    }
  };

  const handleRemoveItem = (idx) => {
    const newItems = ocrResult.items.filter((_, i) => i !== idx);
    if (autoCalculate) {
      const financials = recalculateFinancials(newItems, ocrResult.tax_amount);
      setOcrResult({ ...ocrResult, items: newItems, ...financials });
    } else {
      setOcrResult({ ...ocrResult, items: newItems });
    }
  };

  /* ---------- Step 2 语音 ---------- */
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && audioChunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      setError('Failed to access microphone: ' + err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleProcessVoice = async () => {
    if (!audioBlob) {
      setStep4Initialized(false);
      setActiveStep(4);
      return;
    }
    setSttLoading(true);
    setError(null);
    try {
      const audioFile = new File([audioBlob], 'recording.webm', { type: 'audio/webm' });
      const groupMembers = selectedGroupId
        ? contactGroups
            .find((g) => g.id === selectedGroupId)
            ?.members?.map((m) => (m.contact_nickname || m.contact_email.split('@')[0]).toLowerCase())
            .filter(Boolean) || []
        : null;
      const currentUser = authService.getCurrentUser();
      const currentUserName = currentUser?.email?.split('@')[0]?.toLowerCase() || null;
      const ocrItems = ocrResult?.items || [];
      const result = await sttAPI.processVoice(audioFile, groupMembers, ocrItems, currentUserName);
      setTranscript(result.transcript || result);
      setSttResult(result);
      setActiveStep(3);
      setTimeout(() => setAnalysisLoading(false), 1000);
    } catch (err) {
      setError(err.message || 'Failed to process voice');
    } finally {
      setSttLoading(false);
    }
  };

  /* ---------- Step 4 分摊 ---------- */
  const [expandedItems, setExpandedItems] = useState([]);

  const prepareStep4Data = useCallback(() => {
    if (!ocrResult?.items) return;
    const expanded = [];
    ocrResult.items.forEach((item) => {
      const qty = parseInt(item.quantity) || 1;
      if (qty <= 1) {
        expanded.push({ ...item, originalIndex: expanded.length });
      } else {
        const unitPrice = item.price;
        for (let i = 0; i < qty; i++) {
          expanded.push({
            ...item,
            name: `${item.name} (${i + 1}/${qty})`,
            quantity: 1,
            price: unitPrice,
            originalIndex: expanded.length,
          });
        }
      }
    });
    setExpandedItems(expanded);
    return expanded;
  }, [ocrResult]);

  const addParticipant = (name, assignedIndices = null) => {
    if (!name) return;
    const key = name.toLowerCase().trim();
    if (participants.some((p) => p.toLowerCase().trim() === key)) return;
    const targetItems = expandedItems.length > 0 ? expandedItems : (prepareStep4Data() || []);
    const finalIndices = assignedIndices === null ? targetItems.map((_, idx) => idx) : assignedIndices;
    setParticipants((prev) => [...prev, name]);
    setItemAssignments((prev) => ({ ...prev, [key]: finalIndices }));
  };

  const initializeStep4Participants = useCallback(() => {
    if (participants.length > 0) return;
    const currentExpandedItems = prepareStep4Data();
    if (!currentExpandedItems) return;

    const currentUser = authService.getCurrentUser();
    const currentUserName = currentUser?.email ? currentUser.email.split('@')[0] : 'me';
    const currentUserEmail = currentUser?.email?.toLowerCase();

    let initializedParticipants = [];
    const addParticipantLocal = (name, itemIndices) => {
      if (initializedParticipants.includes(name)) return;
      initializedParticipants.push(name);
      addParticipant(name, itemIndices);
    };

    let initialized = false;

    // STRATEGY 1: STT Participants
    if (sttResult?.participants?.length) {
      const assignedItemIndices = new Set();
      const initialAssignments = {};

      sttResult.participants.forEach((p) => {
        const name = p.name.trim();
        const key = name.toLowerCase().trim();
        const matchedIndices = [];
        if (p.items && p.items.length > 0) {
          p.items.forEach((sttItemName) => {
            currentExpandedItems.forEach((exItem, idx) => {
              const baseName = exItem.name.replace(/\s\(\d+\/\d+\)$/, '');
              if (
                baseName.toLowerCase() === sttItemName.toLowerCase() ||
                baseName.toLowerCase().includes(sttItemName.toLowerCase()) ||
                sttItemName.toLowerCase().includes(baseName.toLowerCase())
              ) {
                matchedIndices.push(idx);
                assignedItemIndices.add(idx);
              }
            });
          });
        }
        initialAssignments[key] = matchedIndices;
      });

      const unassignedIndices = currentExpandedItems
        .map((_, idx) => idx)
        .filter((idx) => !assignedItemIndices.has(idx));

      sttResult.participants.forEach((p) => {
        const name = p.name.trim();
        const key = name.toLowerCase().trim();
        let displayName = name;
        if (key === 'me' || key === currentUserName.toLowerCase() || (currentUserEmail && key === currentUserEmail)) {
          displayName = 'me (You)';
        }
        const specificIndices = initialAssignments[key] || [];
        const finalIndices = [...new Set([...specificIndices, ...unassignedIndices])].sort((a, b) => a - b);
        addParticipantLocal(displayName, finalIndices);
      });

      const isMePresent = initializedParticipants.some((p) => p === 'me (You)' || p.toLowerCase() === 'me');
      if (!isMePresent) addParticipantLocal('me (You)', unassignedIndices);

      if (selectedGroupId) {
        const group = contactGroups.find((g) => g.id === selectedGroupId);
        if (group?.members) {
          group.members.forEach((member) => {
            const memberName = (member.contact_nickname || member.contact_email?.split('@')[0] || '').toLowerCase();
            const memberEmail = member.contact_email?.toLowerCase();
            const alreadyAdded = initializedParticipants.some(
              (p) => p.toLowerCase() === memberName || p.toLowerCase() === memberEmail
            );
            if (!alreadyAdded && !member.is_creator) {
              addParticipantLocal(memberName, unassignedIndices);
            }
          });
        }
      }

      initialized = true;
    }

    // STRATEGY 2: Group Selection
    if (!initialized && selectedGroupId) {
      const group = contactGroups.find((g) => g.id === selectedGroupId);
      if (group?.members) {
        const allIndices = currentExpandedItems.map((_, i) => i);
        let foundCurrentUser = false;
        group.members.forEach((member) => {
          const memberEmail = member.contact_email?.toLowerCase();
          const memberName = member.contact_nickname || member.contact_email.split('@')[0];
          if (memberEmail === currentUserEmail) {
            addParticipantLocal('me (You)', allIndices);
            foundCurrentUser = true;
          } else {
            addParticipantLocal(memberName, allIndices);
          }
        });
        if (!foundCurrentUser) addParticipantLocal('me (You)', allIndices);
        initialized = true;
      }
    }

    // STRATEGY 3: Fallback
    if (!initialized) {
      const allIndices = currentExpandedItems.map((_, i) => i);
      addParticipantLocal('me (You)', allIndices);
    }
  }, [selectedGroupId, contactGroups, sttResult, ocrResult, participants.length]);

  useEffect(() => {
    if (activeStep === 4 && !step4Initialized) {
      initializeStep4Participants();
      setStep4Initialized(true);
    } else if (activeStep !== 4 && activeStep < 3) {
      setStep4Initialized(false);
      setParticipants([]);
      setItemAssignments({});
      setExpandedItems([]);
    }
  }, [activeStep, step4Initialized, initializeStep4Participants]);

  /* ---------- Step 5 保存 ---------- */
  const handleComplete = async () => {
    if (!authService.isAuthenticated()) {
      navigate('/login');
      return;
    }
    if (!ocrResult) return setError('No receipt data to save');
    setLoading(true);
    setError(null);
    try {
      const finalItems = expandedItems.length > 0 ? expandedItems : (ocrResult.items || []);
      const currentUser = authService.getCurrentUser();

      const participantsData = participants.map((name) => {
        const key = name.toLowerCase().trim();
        const indices = itemAssignments[key] || [];
        const items = indices.map((i) => finalItems[i]).filter(Boolean);

        let email = null;
        if (key === 'me (you)' || key === 'me') {
          email = currentUser?.email || null;
        } else {
          const contact = contacts.find(
            (c) =>
              (c.nickname || c.friend_email?.split('@')[0] || '').toLowerCase() === key ||
              c.friend_email?.toLowerCase() === key
          );
          email = contact?.friend_email || null;
        }

        return { name, email, items: items.map((it) => it.name) };
      });

      await expenseAPI.createExpense({
        store_name: ocrResult.store_name || null,
        total_amount: ocrResult.total || 0,
        subtotal: ocrResult.subtotal || null,
        tax_amount: ocrResult.tax_amount || null,
        tax_rate: ocrResult.tax_rate || null,
        raw_text: ocrResult.raw_text || null,
        transcript: transcript || null,
        items: finalItems.map((it) => ({ name: it.name, price: it.price, quantity: 1 })),
        participants: participantsData,
      });
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err.message || 'Failed to save expense');
    } finally {
      setLoading(false);
    }
  };

  /* ---------- 通用回退 ---------- */
  const goBack = () => {
    if (activeStep > 1) setActiveStep((s) => s - 1);
  };

  /* ---------- 每人应付金额计算 ---------- */
  const perPersonTotal = React.useMemo(() => {
    const itemsToUse = expandedItems.length > 0 ? expandedItems : (ocrResult?.items || []);
    if (!itemsToUse || itemsToUse.length === 0) return {};
    const res = {};
    participants.forEach((p) => {
      const key = p.toLowerCase().trim();
      const indices = itemAssignments[key] || [];
      let sum = 0;
      indices.forEach((itemIdx) => {
        const item = itemsToUse[itemIdx];
        if (!item) return;
        const shareCount = participants.filter((pp) =>
          itemAssignments[pp.toLowerCase().trim()]?.includes(itemIdx)
        ).length;
        if (shareCount) sum += (item.price || 0) / shareCount;
      });
      res[p] = sum.toFixed(2);
    });
    return res;
  }, [participants, itemAssignments, ocrResult, expandedItems]);

  /* ************************************************ */
  /* UI 渲染                                           */
  /* ************************************************ */
  return (
    <div className="max-w-7xl mx-auto px-16" ref={topRef}>
      {/* 未登录时显示顶部登录入口 */}
      {!authService.isAuthenticated() && (
        <div className="flex justify-between items-center py-4 mb-2 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">$</span>
            </div>
            <span className="font-bold text-gray-900">SmartBill</span>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
          >
            Log in
          </button>
        </div>
      )}
      <PageHeader
        title="Create New Expense"
        subtitle="Upload a bill and use voice to describe the split"
      />
      <StepIndicator steps={STEPS} activeStep={activeStep} />

      {/* ── Step 1 — Upload Bill ── */}
      {activeStep === 1 && (
        <>
          <UploadArea
            onFileSelect={handleFileSelect}
            selectedFile={selectedFile}
            onRemoveFile={handleRemoveFile}
            manualTotal={manualTotal}
            onManualTotalChange={setManualTotal}
          />

          {contactGroups.length > 0 && (
            <div className="mt-8 p-6 bg-white rounded-xl border border-gray-200">
              <h4 className="text-lg font-semibold mb-2">Select Friend Group (Optional)</h4>
              <p className="text-sm text-gray-500 mb-4">Help AI better understand the bill split</p>
              <select
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={selectedGroupId || ''}
                onChange={(e) => setSelectedGroupId(e.target.value || null)}
              >
                <option value="">No group selected</option>
                {contactGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.member_count} {g.member_count === 1 ? 'member' : 'members'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {(selectedFile || manualTotal) && (
            <div className="mt-8 flex items-center justify-center gap-4">
              {selectedFile && (
                <button
                  className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 hover:-translate-y-0.5 hover:shadow-lg transition"
                  onClick={handleProcessReceipt}
                  disabled={loading}
                >
                  {loading ? 'Processing...' : 'Process Receipt'}
                </button>
              )}
              {manualTotal && (
                <button
                  className="inline-flex items-center gap-2 px-8 py-4 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 hover:-translate-y-0.5 hover:shadow-lg transition"
                  onClick={() => {
                    setOcrResult({
                      store_name: null,
                      total: parseFloat(manualTotal),
                      subtotal: parseFloat(manualTotal),
                      tax_amount: null,
                      tax_rate: null,
                      items: [{ name: 'Total Bill', price: parseFloat(manualTotal), quantity: 1 }],
                      raw_text: null,
                    });
                    setActiveStep(2);
                  }}
                >
                  Skip OCR → Next Step
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Step 2 — Voice Input ── */}
      {activeStep === 2 && (
        <div className="mt-8 space-y-8">
          {ocrResult && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200">
                <div>
                  <h3 className="text-xl font-semibold flex items-center gap-2">📝 Receipt Details (Editable)</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {autoCalculate
                      ? '✓ Auto-calculating: Subtotal & Total update when you edit items'
                      : '✗ Manual mode: Edit all fields freely'}
                  </p>
                </div>
                <label className="flex items-center gap-3 cursor-pointer bg-gray-50 px-4 py-2 rounded-lg border border-gray-200 hover:border-blue-400 transition">
                  <span className="text-sm font-medium text-gray-700">Auto Calculate</span>
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={autoCalculate}
                      onChange={(e) => setAutoCalculate(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-blue-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-gray-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Store Name</label>
                  <input
                    type="text"
                    value={ocrResult.store_name || ''}
                    onChange={(e) => setOcrResult({ ...ocrResult, store_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Total Amount
                    {autoCalculate && <span className="text-xs text-green-600 ml-2">Auto-calculated</span>}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={ocrResult.total || ''}
                    onChange={(e) => setOcrResult({ ...ocrResult, total: parseFloat(e.target.value) || 0 })}
                    disabled={autoCalculate}
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      autoCalculate
                        ? 'bg-green-50 border-green-300 cursor-not-allowed text-green-900 font-semibold'
                        : 'border-gray-300'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Subtotal (before tax)
                    {autoCalculate && <span className="text-xs text-green-600 ml-2">Auto-calculated</span>}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={ocrResult.subtotal || ''}
                    onChange={(e) =>
                      setOcrResult({ ...ocrResult, subtotal: parseFloat(e.target.value) || null })
                    }
                    disabled={autoCalculate}
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      autoCalculate
                        ? 'bg-green-50 border-green-300 cursor-not-allowed text-green-900 font-semibold'
                        : 'border-gray-300'
                    }`}
                  />
                </div>
                {ocrResult.tax_amount !== null && ocrResult.tax_amount !== undefined && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tax Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      value={ocrResult.tax_amount}
                      onChange={(e) => {
                        const newTaxAmount = parseFloat(e.target.value) || 0;
                        if (autoCalculate) {
                          setOcrResult({
                            ...ocrResult,
                            tax_amount: newTaxAmount,
                            total: (ocrResult.subtotal || 0) + newTaxAmount,
                          });
                        } else {
                          setOcrResult({ ...ocrResult, tax_amount: newTaxAmount });
                        }
                      }}
                      className="w-full px-3 py-2 border border-amber-300 bg-amber-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-amber-900"
                    />
                    <p className="mt-1 text-xs text-amber-600">
                      This value comes from your receipt. Edit only if OCR misread it.
                    </p>
                  </div>
                )}
              </div>

              {ocrResult.items && ocrResult.items.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">
                    Items ({ocrResult.items.length})
                    {autoCalculate && (
                      <span className="text-xs text-green-600 ml-2 font-normal">
                        Changes will auto-update Subtotal & Total
                      </span>
                    )}
                  </h4>
                  <div className="space-y-3">
                    {ocrResult.items.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg p-3"
                      >
                        <input
                          type="text"
                          value={item.name || ''}
                          onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                          placeholder="Item name"
                          className="flex-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <input
                          type="number"
                          step="0.01"
                          value={item.price || ''}
                          onChange={(e) => handleItemChange(idx, 'price', e.target.value)}
                          placeholder="Price"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <input
                          type="number"
                          min="1"
                          value={item.quantity || 1}
                          onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                          placeholder="Qty"
                          className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          className="w-8 h-8 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center justify-center"
                          onClick={() => handleRemoveItem(idx)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                    onClick={handleAddItem}
                  >
                    + Add Item
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6 text-center">
            <h3 className="text-xl font-semibold mb-2">Voice Input</h3>
            <p className="text-gray-500 mb-6">Describe how to split this bill (optional)</p>
            <div className="flex items-center justify-center gap-4">
              {!isRecording ? (
                <button
                  className="inline-flex items-center gap-2 px-8 py-4 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 hover:-translate-y-0.5 transition"
                  onClick={startRecording}
                >
                  <Mic size={24} /> Start Recording
                </button>
              ) : (
                <button
                  className="inline-flex items-center gap-2 px-8 py-4 bg-red-600 text-white rounded-lg hover:bg-red-700 hover:-translate-y-0.5 transition"
                  onClick={stopRecording}
                >
                  <MicOff size={24} /> Stop Recording
                </button>
              )}
            </div>
            {audioBlob && (
              <div className="mt-4 px-4 py-3 bg-green-50 border border-green-200 text-green-700 rounded-lg">
                <p>✅ Audio recorded ({Math.round(audioBlob.size / 1024)} KB)</p>
              </div>
            )}
            {transcript && (
              <div className="mt-4 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-left">
                <h4 className="text-sm font-semibold text-gray-700 mb-1">
                  Transcript:{' '}
                  <span className="text-xs text-gray-400 font-normal">(you can edit before submitting)</span>
                </h4>
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-700 resize-none"
                />
              </div>
            )}
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={goBack}
                className="inline-flex items-center gap-2 px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                ← Back
              </button>
              <button
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                onClick={handleProcessVoice}
                disabled={sttLoading}
              >
                {sttLoading ? 'Processing...' : audioBlob ? 'Confirm & Continue' : 'Skip Voice Input'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3 — AI Analysis ── */}
      {activeStep === 3 && (
        <div className="mt-8 bg-white rounded-xl border border-gray-200 p-8">
          <h3 className="text-2xl font-bold text-center mb-6">AI Analysis Summary</h3>
          {analysisLoading ? (
            <div className="text-center py-16 text-gray-500">Processing expense split...</div>
          ) : (
            <>
              {ocrResult && (
                <div className="mb-6 p-6 bg-gray-50 border border-gray-200 rounded-lg">
                  <h4 className="text-lg font-semibold mb-4">Receipt Summary</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Store:</span>
                      <span className="font-medium">{ocrResult.store_name || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total:</span>
                      <span className="font-medium">${ocrResult.total?.toFixed(2) || 'N/A'}</span>
                    </div>
                    {ocrResult.subtotal && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Subtotal:</span>
                        <span className="font-medium">${ocrResult.subtotal.toFixed(2)}</span>
                      </div>
                    )}
                    {ocrResult.tax_amount && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Tax:</span>
                        <span className="font-medium">${ocrResult.tax_amount.toFixed(2)}</span>
                      </div>
                    )}
                    {ocrResult.items?.length > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Items:</span>
                        <span className="font-medium">{ocrResult.items.length} items</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {transcript && (
                <div className="mb-6 p-6 bg-gray-50 border border-gray-200 rounded-lg">
                  <h4 className="text-lg font-semibold mb-3">Voice Instructions</h4>
                  <p className="text-xs text-gray-400 mb-2">
                    You can edit the transcript and re-analyze if needed
                  </p>
                  <textarea
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-700 resize-none mb-3"
                  />
                  <button
                    className="px-4 py-2 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 transition"
                    disabled={sttLoading}
                    onClick={async () => {
                      if (!transcript.trim()) return;
                      setSttLoading(true);
                      try {
                        const currentUser = authService.getCurrentUser();
                        const currentUserName = currentUser?.email?.split('@')[0]?.toLowerCase() || null;
                        const groupMembers = selectedGroupId
                          ? contactGroups
                              .find((g) => g.id === selectedGroupId)
                              ?.members?.map((m) =>
                                (m.contact_nickname || m.contact_email?.split('@')[0]).toLowerCase()
                              )
                              .filter(Boolean) || []
                          : null;

                        const formData = new FormData();
                        const blob = audioBlob || new Blob([], { type: 'audio/webm' });
                        formData.append('audio', new File([blob], 'recording.webm', { type: 'audio/webm' }));
                        if (groupMembers && groupMembers.length > 0) {
                          formData.append('group_members', JSON.stringify(groupMembers));
                        }
                        if (ocrResult?.items?.length > 0) {
                          const itemNames = ocrResult.items.map((i) => i.name);
                          formData.append('ocr_items', JSON.stringify(itemNames));
                        }
                        if (currentUserName) {
                          formData.append('current_user_name', currentUserName);
                        }
                        formData.append('override_transcript', transcript);

                        const token = localStorage.getItem('auth_token');
                        const response = await fetch('http://localhost:5001/api/stt/process-voice', {
                          method: 'POST',
                          headers: { ...(token && { Authorization: `Bearer ${token}` }) },
                          body: formData,
                        });
                        const result = await response.json();
                        setTranscript(transcript);
                        setSttResult({ ...result, transcript });
                      } catch (err) {
                        console.error('Re-analyze error:', err);
                      } finally {
                        setSttLoading(false);
                      }
                    }}
                  >
                    {sttLoading ? 'Re-analyzing...' : '↻ Re-analyze'}
                  </button>

                  {sttResult?.participants?.length > 0 && (
                    <div className="mt-4">
                      <h5 className="text-sm font-semibold text-gray-700 mb-2">Detected Participants:</h5>
                      <ul className="space-y-1">
                        {sttResult.participants.map((p, idx) => (
                          <li key={idx} className="text-sm text-gray-700">
                            <strong>{p.name}</strong>: {p.items?.join(', ') || 'No items specified'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="text-center flex items-center justify-center gap-3">
                <button
                  onClick={goBack}
                  className="inline-flex items-center gap-2 px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  ← Back
                </button>
                <button
                  className="inline-flex items-center gap-2 px-8 py-4 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
                  onClick={() => { setStep4Initialized(false); setActiveStep(4); }}
                  disabled={loading}
                >
                  Continue to Bill Split →
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Step 4 — Bill Split ── */}
      {activeStep === 4 && (
        <div className="mt-8 space-y-8">
          <div>
            <h3 className="text-2xl font-bold mb-2">Bill Split</h3>
            <p className="text-gray-500 mb-8">Select participants and assign items to each person.</p>

            {!selectedGroupId && !sttResult?.participants && contactGroups.length > 0 && (
              <div className="p-6 bg-white rounded-xl border border-gray-200">
                <h4 className="text-lg font-semibold mb-2">Select Friend Group (Optional)</h4>
                <p className="text-sm text-gray-500 mb-4">Quickly add all members from a group</p>
                <select
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      const group = contactGroups.find((g) => g.id === e.target.value);
                      if (group?.members) {
                        const names = group.members.map(
                          (m) => m.contact_nickname || m.contact_email.split('@')[0]
                        );
                        names.forEach(addParticipant);
                        setSelectedGroupId(e.target.value);
                      }
                    }
                  }}
                >
                  <option value="">Select a group to add members...</option>
                  {contactGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.member_count} {g.member_count === 1 ? 'member' : 'members'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <input
                type="text"
                placeholder="Enter participant name"
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && e.target.value.trim()) {
                    addParticipant(e.target.value.trim());
                    e.target.value = '';
                  }
                }}
              />
              <button
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                onClick={(e) => {
                  const input = e.target.previousElementSibling;
                  addParticipant(input.value.trim());
                  input.value = '';
                }}
              >
                + Add Participant
              </button>
            </div>

            {participants.length > 0 && (
              <div className="space-y-4">
                <h4 className="text-lg font-semibold">Participants ({participants.length})</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {participants.map((participant, pIdx) => {
                    const key = participant.toLowerCase().trim();
                    return (
                      <div key={pIdx} className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between">
                        <h5 className="font-semibold text-gray-900">{participant}</h5>
                        <button
                          className="w-8 h-8 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center justify-center"
                          onClick={() => {
                            setParticipants(participants.filter((_, i) => i !== pIdx));
                            const newAssignments = { ...itemAssignments };
                            delete newAssignments[key];
                            setItemAssignments(newAssignments);
                          }}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {expandedItems.length > 0 && (
              <div className="space-y-4">
                <h4 className="text-lg font-semibold">Items ({expandedItems.length})</h4>
                <div className="space-y-4">
                  {expandedItems.map((item, itemIdx) => {
                    const assignedTo = participants.filter((p) =>
                      itemAssignments[p.toLowerCase().trim()]?.includes(itemIdx)
                    );
                    const shareCount = assignedTo.length;
                    const amountPerPerson = shareCount > 0 ? (item.price || 0) / shareCount : 0;
                    return (
                      <div key={itemIdx} className="bg-white border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200">
                          <span className="font-semibold text-gray-900">{item.name}</span>
                          <div className="text-right">
                            <span className="text-lg font-bold text-emerald-600">
                              ${item.price.toFixed(2)}
                            </span>
                            {shareCount > 0 && (
                              <span className="block text-xs text-gray-500">
                                (${amountPerPerson.toFixed(2)} per person × {shareCount})
                              </span>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Assign to:
                          </label>
                          {participants.length === 0 ? (
                            <p className="text-sm text-gray-500">
                              Add participants first to assign items
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-3">
                              {participants.map((participant) => {
                                const pKey = participant.toLowerCase().trim();
                                return (
                                  <label
                                    key={participant}
                                    className="flex items-center gap-2 px-3 py-2 bg-gray-100 border border-gray-200 rounded-md cursor-pointer hover:bg-gray-200 has-[:checked]:bg-blue-100 has-[:checked]:border-blue-500 has-[:checked]:text-blue-700"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={itemAssignments[pKey]?.includes(itemIdx) || false}
                                      onChange={(e) => {
                                        const newAssignments = { ...itemAssignments };
                                        if (!newAssignments[pKey]) newAssignments[pKey] = [];
                                        if (e.target.checked) {
                                          if (!newAssignments[pKey].includes(itemIdx))
                                            newAssignments[pKey] = [...newAssignments[pKey], itemIdx];
                                        } else {
                                          newAssignments[pKey] = newAssignments[pKey].filter(
                                            (idx) => idx !== itemIdx
                                          );
                                        }
                                        setItemAssignments(newAssignments);
                                      }}
                                    />
                                    {participant}
                                    {itemAssignments[pKey]?.includes(itemIdx) && (
                                      <span className="text-xs text-blue-600 font-medium">
                                        (${amountPerPerson.toFixed(2)})
                                      </span>
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="text-center flex items-center justify-center gap-3">
              <button
                onClick={goBack}
                className="inline-flex items-center gap-2 px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                ← Back
              </button>
              <button
                className="inline-flex items-center gap-2 px-8 py-4 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
                onClick={() => setActiveStep(5)}
                disabled={loading}
              >
                Continue to Bill Summary →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 5 — Bill Summary ── */}
      {activeStep === 5 && (
        <div className="mt-8 space-y-8">
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <h3 className="text-2xl font-bold text-center mb-6">Bill Summary</h3>
            <div className="mb-6 p-6 bg-gray-50 border border-gray-200 rounded-lg">
              <h4 className="text-lg font-semibold mb-4">Expense Details</h4>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Store:</span>
                  <span className="font-medium">{ocrResult?.store_name || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total:</span>
                  <span className="font-medium">${ocrResult?.total?.toFixed(2) || 'N/A'}</span>
                </div>
                {ocrResult?.subtotal && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Subtotal:</span>
                    <span className="font-medium">${ocrResult.subtotal.toFixed(2)}</span>
                  </div>
                )}
                {ocrResult?.tax_amount && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Tax:</span>
                    <span className="font-medium">${ocrResult.tax_amount.toFixed(2)}</span>
                  </div>
                )}
                {ocrResult?.items?.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Items:</span>
                    <span className="font-medium">{ocrResult.items.length} items</span>
                  </div>
                )}
              </div>
            </div>

            <div className="mb-6 p-6 bg-gray-50 border border-gray-200 rounded-lg">
              <h4 className="text-lg font-semibold mb-4">Per-person Share</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {participants.map((p) => (
                  <div
                    key={p}
                    className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-4"
                  >
                    <span className="font-medium text-gray-900">{p}</span>
                    <span className="text-lg font-bold text-emerald-600">
                      ${perPersonTotal[p] || '0.00'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {!authService.isAuthenticated() && (
              <div className="mb-6 px-4 py-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-center">
                You need to{' '}
                <button onClick={() => navigate('/login')} className="underline font-semibold">
                  log in
                </button>{' '}
                to save this expense.
              </div>
            )}

            <div className="text-center flex items-center justify-center gap-3">
              <button
                onClick={goBack}
                className="inline-flex items-center gap-2 px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                ← Back
              </button>
              <button
                className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                onClick={handleComplete}
                disabled={loading}
              >
                {loading ? 'Saving...' : authService.isAuthenticated() ? 'Confirm & Save' : 'Log in to Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-6 px-4 py-3 bg-red-50 border border-red-200 text-red-600 rounded-lg">
          {error}
        </div>
      )}
    </div>
  );
};

export default NewExpense;