import React, { useState, useEffect } from 'react';
import {
  Users as UsersIcon, Mail, UserPlus, Trash2, Loader, FolderPlus, Edit2, X, Check, Plus
} from 'lucide-react';
import { contactsAPI, contactGroupsAPI } from '../services/api';
import authService from '../services/authService';

const Participants = () => {
  const [activeTab, setActiveTab] = useState('contacts');
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Contacts state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactNickname, setNewContactNickname] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingContactId, setEditingContactId] = useState(null);
  const [editingNickname, setEditingNickname] = useState('');
  const [updatingNickname, setUpdatingNickname] = useState(false);

  // Groups state
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState([]);
  const [savingGroup, setSavingGroup] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  // Free-input members (name only, not linked to contacts)
  const [freeMembers, setFreeMembers] = useState([]);
  const [freeMemberInput, setFreeMemberInput] = useState('');

  useEffect(() => {
    const user = authService.getCurrentUser();
    if (user) setCurrentUser(user);
    else import('../services/api').then(({ authAPI }) => authAPI.getCurrentUser().then(setCurrentUser).catch(() => {}));
  }, []);

  useEffect(() => {
    activeTab === 'contacts' ? loadContacts() : loadGroups();
  }, [activeTab]);

  const loadContacts = async () => {
    setLoading(true);
    try {
      const res = await contactsAPI.getContacts();
      setContacts(res.contacts || []);
    } catch (err) {
      setError('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  };

  const loadGroups = async () => {
    setLoading(true);
    try {
      const res = await contactGroupsAPI.getContactGroups();
      setGroups(res.groups || []);
    } catch (err) {
      setError('Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  const handleAddContact = async (e) => {
    e.preventDefault();
    if (!newContactEmail) return;
    setAdding(true);
    setError('');
    try {
      await contactsAPI.addContact(newContactEmail, newContactNickname || null);
      await loadContacts();
      setNewContactEmail('');
      setNewContactNickname('');
      setIsAddModalOpen(false);
    } catch (err) {
      setError(err.message || 'Failed to add contact');
    } finally {
      setAdding(false);
    }
  };

  const handleEditNickname = (contact) => {
    setEditingContactId(contact.id);
    setEditingNickname(contact.nickname || '');
  };

  const handleSaveNickname = async (contactId) => {
    setUpdatingNickname(true);
    try {
      await contactsAPI.updateContact(contactId, editingNickname || null);
      await loadContacts();
      setEditingContactId(null);
      setEditingNickname('');
    } catch (err) {
      alert('Failed to update nickname: ' + err.message);
    } finally {
      setUpdatingNickname(false);
    }
  };

  const handleDeleteContact = async (contactId, friendEmail) => {
    if (!window.confirm(`Remove ${friendEmail} from your contacts?`)) return;
    try {
      await contactsAPI.deleteContact(contactId);
      await loadContacts();
      await loadGroups();
    } catch (err) {
      alert('Failed to delete contact: ' + err.message);
    }
  };

  const handleOpenGroupModal = (group = null) => {
    setEditingGroup(group);
    setGroupName(group?.name || '');
    setGroupDescription(group?.description || '');
    setSelectedContactIds(
      group?.members
        ?.filter((m) => m.contact_id !== null && m.contact_id !== undefined)
        .map((m) => m.contact_id) || []
    );
    // Load free members from group (members without contact_id)
    setFreeMembers(
      group?.members
        ?.filter((m) => !m.contact_id && !m.is_creator)
        .map((m) => m.contact_nickname || m.contact_email?.split('@')[0] || '') || []
    );
    setFreeMemberInput('');
    setIsGroupModalOpen(true);
  };

  const handleAddFreeMember = () => {
    const name = freeMemberInput.trim();
    if (!name) return;
    if (freeMembers.includes(name)) return;
    setFreeMembers((prev) => [...prev, name]);
    setFreeMemberInput('');
  };

  const handleRemoveFreeMember = (name) => {
    setFreeMembers((prev) => prev.filter((m) => m !== name));
  };

  const handleSaveGroup = async () => {
    if (!groupName.trim()) return setError('Group name is required');
    setSavingGroup(true);
    setError('');
    try {
      // Combine contact IDs and free member names into one payload
      // Free members are sent as { name } objects, backend stores as nickname
      const payload = {
        name: groupName,
        description: groupDescription || null,
        contact_ids: selectedContactIds,
        free_members: freeMembers, // new field
      };

      if (editingGroup) {
        await contactGroupsAPI.updateContactGroup(
          editingGroup.id, groupName, groupDescription || null, selectedContactIds, freeMembers
        );
      } else {
        await contactGroupsAPI.createContactGroup(
          groupName, groupDescription || null, selectedContactIds, freeMembers
        );
      }
      await loadGroups();
      setIsGroupModalOpen(false);
      resetGroupForm();
    } catch (err) {
      setError(err.message || 'Failed to save group');
    } finally {
      setSavingGroup(false);
    }
  };

  const handleDeleteGroup = async (groupId, groupName) => {
    if (!window.confirm(`Delete group "${groupName}"? This will not delete the contacts.`)) return;
    try {
      await contactGroupsAPI.deleteContactGroup(groupId);
      await loadGroups();
    } catch (err) {
      alert('Failed to delete group: ' + err.message);
    }
  };

  const toggleContactSelection = (contactId) => {
    setSelectedContactIds((prev) =>
      prev.includes(contactId) ? prev.filter((id) => id !== contactId) : [...prev, contactId]
    );
  };

  const resetGroupForm = () => {
    setEditingGroup(null);
    setGroupName('');
    setGroupDescription('');
    setSelectedContactIds([]);
    setFreeMembers([]);
    setFreeMemberInput('');
  };

  const getDisplayName = (contact) => contact.nickname || contact.friend_email.split('@')[0];

  return (
    <div className="p-10 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <UsersIcon size={32} /> My Contacts & Groups
          </h1>
          <p className="text-base text-gray-500">Manage your contacts and organize them into groups</p>
        </div>
        <button
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          onClick={() => (activeTab === 'contacts' ? setIsAddModalOpen(true) : handleOpenGroupModal())}
        >
          {activeTab === 'contacts' ? <UserPlus size={20} /> : <FolderPlus size={20} />}
          {activeTab === 'contacts' ? 'Add Friend' : 'Create Group'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 mb-8">
        {['contacts', 'groups'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2 px-5 py-3 border-b-2 text-sm font-medium transition ${
              activeTab === tab ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab === 'contacts' ? <UsersIcon size={18} /> : <FolderPlus size={18} />}
            {tab === 'contacts' ? `Contacts (${contacts.length})` : `Groups (${groups.length})`}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 flex items-center justify-between px-4 py-3 bg-red-50 border border-red-200 text-red-600 rounded-lg">
          {error}
          <button onClick={() => setError('')} className="text-lg">×</button>
        </div>
      )}

      {/* Contacts Tab */}
      {activeTab === 'contacts' && (
        <>
          {loading ? (
            <div className="text-center py-20 text-gray-500">
              <Loader size={32} className="mx-auto mb-4 animate-spin" />
              <p>Loading contacts...</p>
            </div>
          ) : contacts.length === 0 ? (
            <div className="py-20 border-2 border-dashed border-gray-200 rounded-xl text-center text-gray-500">
              <UsersIcon size={64} className="mx-auto mb-4 text-gray-300" />
              <h3 className="text-xl font-semibold mb-2">No contacts yet</h3>
              <p className="mb-6">Add friends to start splitting bills</p>
              <button className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700" onClick={() => setIsAddModalOpen(true)}>
                <UserPlus size={20} /> Add Your First Friend
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
              {contacts.map((contact) => (
                <div key={contact.id} className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md hover:border-gray-300 transition">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-lg flex items-center justify-center">
                      {contact.nickname ? contact.nickname[0].toUpperCase() : contact.friend_email[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      {editingContactId === contact.id ? (
                        <div className="flex flex-col gap-2">
                          <input
                            type="text"
                            value={editingNickname}
                            onChange={(e) => setEditingNickname(e.target.value)}
                            className="px-3 py-2 border-2 border-blue-500 rounded-md text-base font-semibold w-full"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button className="p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700" onClick={() => handleSaveNickname(contact.id)} disabled={updatingNickname}>
                              <Check size={16} />
                            </button>
                            <button className="p-2 border border-gray-300 text-gray-600 rounded-md hover:bg-gray-100" onClick={() => setEditingContactId(null)}>
                              <X size={16} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <h3 className="text-lg font-semibold text-gray-900 truncate">{getDisplayName(contact)}</h3>
                          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                            <Mail size={14} />
                            <span className="truncate">{contact.friend_email}</span>
                          </div>
                          <p className="text-xs text-gray-400">Added {new Date(contact.created_at).toLocaleDateString()}</p>
                        </>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {editingContactId !== contact.id && (
                        <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-md" onClick={() => handleEditNickname(contact)} title="Edit nickname">
                          <Edit2 size={18} />
                        </button>
                      )}
                      <button className="p-2 text-gray-500 hover:bg-red-100 hover:text-red-600 rounded-md" onClick={() => handleDeleteContact(contact.id, contact.friend_email)} title="Remove contact">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Groups Tab */}
      {activeTab === 'groups' && (
        <>
          {loading ? (
            <div className="text-center py-20 text-gray-500">
              <Loader size={32} className="mx-auto mb-4 animate-spin" />
              <p>Loading groups...</p>
            </div>
          ) : groups.length === 0 ? (
            <div className="py-20 border-2 border-dashed border-gray-200 rounded-xl text-center text-gray-500">
              <FolderPlus size={64} className="mx-auto mb-4 text-gray-300" />
              <h3 className="text-xl font-semibold mb-2">No groups yet</h3>
              <p className="mb-6">Create groups to organize your contacts</p>
              <button className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700" onClick={() => handleOpenGroupModal()}>
                <FolderPlus size={20} /> Create Your First Group
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5">
              {groups.map((group) => (
                <div key={group.id} className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md hover:border-gray-300 transition">
                  <div className="flex justify-between items-start mb-4 pb-4 border-b border-gray-200">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{group.name}</h3>
                      {group.description && <p className="text-sm text-gray-500 mt-1">{group.description}</p>}
                      <p className="text-xs text-gray-400 mt-2">{group.member_count} {group.member_count === 1 ? 'member' : 'members'}</p>
                    </div>
                    {currentUser && group.user_id && String(currentUser.id || currentUser.user_id) === String(group.user_id) ? (
                      <div className="flex gap-2">
                        <button className="p-2 text-gray-500 hover:bg-blue-50 hover:text-blue-600 rounded-md" onClick={() => handleOpenGroupModal(group)}>
                          <Edit2 size={16} />
                        </button>
                        <button className="p-2 text-gray-500 hover:bg-red-100 hover:text-red-600 rounded-md" onClick={() => handleDeleteGroup(group.id, group.name)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500 italic">Shared Group</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {group.members.length > 0 ? group.members.map((member, idx) => (
                      <div key={idx} className={`px-3 py-1.5 rounded-full text-sm ${member.is_creator ? 'bg-blue-100 text-blue-700 font-medium' : 'bg-gray-100 text-gray-700'}`}>
                        {member.contact_nickname || member.contact_email?.split('@')[0]}
                        {member.is_creator && <span className="text-xs opacity-75 ml-1">(You)</span>}
                      </div>
                    )) : (
                      <p className="text-sm text-gray-400 italic">No members in this group</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Add Contact Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setIsAddModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-[90%] max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-bold">Add New Friend</h2>
              <button className="text-gray-400 hover:bg-gray-100 rounded-lg p-1" onClick={() => setIsAddModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddContact} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Friend's Email *</label>
                <input
                  type="email"
                  placeholder="friend@example.com"
                  value={newContactEmail}
                  onChange={(e) => setNewContactEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">They must be registered on SmartBill</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nickname (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g., John, Best Friend"
                  value={newContactNickname}
                  onChange={(e) => setNewContactNickname(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {error && <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg">{error}</div>}
            </form>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
              <button className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50" onClick={() => setIsAddModalOpen(false)}>Cancel</button>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700" onClick={handleAddContact} disabled={adding || !newContactEmail}>
                {adding ? 'Adding...' : 'Add Friend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group Modal */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setIsGroupModalOpen(false); resetGroupForm(); }}>
          <div className="bg-white rounded-xl shadow-xl w-[90%] max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-bold">{editingGroup ? 'Edit Group' : 'Create New Group'}</h2>
              <button className="text-gray-400 hover:bg-gray-100 rounded-lg p-1" onClick={() => { setIsGroupModalOpen(false); resetGroupForm(); }}>
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Group Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Group Name *</label>
                <input
                  type="text"
                  placeholder="e.g., Friends, Family, Colleagues"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  autoFocus
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
                <textarea
                  placeholder="Describe this group..."
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Free-input members */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Add Members by Name
                  <span className="text-xs text-gray-400 font-normal ml-2">— no account needed</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g., Alice, Bob..."
                    value={freeMemberInput}
                    onChange={(e) => setFreeMemberInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddFreeMember(); } }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleAddFreeMember}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-1"
                  >
                    <Plus size={16} /> Add
                  </button>
                </div>
                {freeMembers.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {freeMembers.map((name) => (
                      <span key={name} className="flex items-center gap-1 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full text-sm">
                        {name}
                        <button onClick={() => handleRemoveFreeMember(name)} className="hover:text-red-500">
                          <X size={14} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Select from existing contacts */}
              {contacts.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Add from Contacts
                    <span className="text-xs text-gray-400 font-normal ml-2">— optional</span>
                  </label>
                  <div className="max-h-48 overflow-y-auto bg-gray-50 border border-gray-200 rounded-lg p-2 space-y-1">
                    {contacts.map((contact) => (
                      <label key={contact.id} className="flex items-center gap-3 p-2 bg-white rounded-md cursor-pointer hover:bg-gray-100">
                        <input
                          type="checkbox"
                          checked={selectedContactIds.includes(contact.id)}
                          onChange={() => toggleContactSelection(contact.id)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span className="font-medium text-gray-900">{contact.nickname || contact.friend_email.split('@')[0]}</span>
                        <span className="text-sm text-gray-400 ml-auto">{contact.friend_email}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {error && <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg">{error}</div>}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
              <button className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50" onClick={() => { setIsGroupModalOpen(false); resetGroupForm(); }}>
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                onClick={handleSaveGroup}
                disabled={savingGroup || !groupName.trim()}
              >
                {savingGroup ? 'Saving...' : editingGroup ? 'Update Group' : 'Create Group'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Participants;