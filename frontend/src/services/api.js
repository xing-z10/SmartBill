/**
 * API Client for SmartBill Backend
 * Base URL: http://localhost:5001 (api_service)
 */
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

/**
 * Get auth token from localStorage
 */
const getToken = () => {
  return localStorage.getItem('auth_token');
};

/**
 * Set auth token in localStorage
 */
const setToken = (token) => {
  localStorage.setItem('auth_token', token);
};

/**
 * Remove auth token from localStorage
 */
const removeToken = () => {
  localStorage.removeItem('auth_token');
};

/**
 * Base fetch function with authentication
 */
const apiRequest = async (endpoint, options = {}) => {
  const token = getToken();
  const url = `${API_BASE_URL}${endpoint}`;
  
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);
    
    // Handle 401 Unauthorized
    if (response.status === 401) {
      removeToken();
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.detail || data.message || 'Request failed');
    }
    
    return data;
  } catch (error) {
    console.error('API request error:', error);
    throw error;
  }
};

/**
 * Authentication API
 */
export const authAPI = {
  /**
   * Send verification code to email
   */
  sendVerificationCode: async (email) => {
    return apiRequest('/api/auth/send-verification-code', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  /**
   * Register new user
   */
  register: async (email, password, verificationCode) => {
    const response = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        verification_code: verificationCode,
      }),
    });
    
    if (response.access_token) {
      setToken(response.access_token);
    }
    
    return response;
  },

  /**
   * Login
   */
  login: async (email, password) => {
    const response = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    
    if (response.access_token) {
      setToken(response.access_token);
    }
    
    return response;
  },

  /**
   * Send password reset code
   */
  sendPasswordResetCode: async (email) => {
    return apiRequest('/api/auth/send-password-reset-code', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  /**
   * Reset password
   */
  resetPassword: async (email, verificationCode, newPassword) => {
    return apiRequest('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        email,
        verification_code: verificationCode,
        new_password: newPassword,
      }),
    });
  },

  /**
   * Get current user info
   */
  getCurrentUser: async () => {
    const token = getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }
    
    // Use fetch directly to ensure token is in header
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    if (response.status === 401) {
      removeToken();
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.detail || data.message || 'Failed to get user info');
    }
    
    return data;
  },

  /**
   * Logout
   */
  logout: () => {
    removeToken();
  },

  /**
   * Check if user is logged in
   */
  isAuthenticated: () => {
    return !!getToken();
  },
};

/**
 * OCR API
 */
export const ocrAPI = {
  /**
   * Upload receipt image for OCR
   */
  uploadReceipt: async (imageFile) => {
    const formData = new FormData();
    formData.append('image', imageFile);
    
    const token = getToken();
    const response = await fetch(`${API_BASE_URL}/api/ocr/upload`, {
      method: 'POST',
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: formData,
    });
    
    if (response.status === 401) {
      removeToken();
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.detail || data.message || 'OCR failed');
    }
    
    return data;
  },

  /**
   * Test OCR parser with raw text
   */
  testParser: async (text) => {
    return apiRequest('/api/ocr/test', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  },
};

/**
 * STT API
 */
export const sttAPI = {
  /**
   * Process voice input for expense
   * @param {File} audioFile - Audio file to process
   * @param {Array<string>} groupMembers - Optional list of group member names to help AI parsing
   * @param {Array} ocrItems - Optional list of OCR items to match against
   */
  processVoice: async (audioFile, groupMembers = null, ocrItems = null, currentUserName = null) => {
    const formData = new FormData();
    formData.append('audio', audioFile);
    if (groupMembers && groupMembers.length > 0) {
      formData.append('group_members', JSON.stringify(groupMembers));
    }
    if (ocrItems && ocrItems.length > 0) {
      // Extract item names from OCR items (handle both object format and string format)
      const itemNames = ocrItems.map(item => 
        typeof item === 'object' && item !== null ? item.name : item
      );
      formData.append('ocr_items', JSON.stringify(itemNames));
    }
    if (currentUserName) {
      formData.append('current_user_name', currentUserName);
    }
    
    const token = getToken();
    const response = await fetch(`${API_BASE_URL}/api/stt/process-voice`, {
      method: 'POST',
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: formData,
    });
    
    if (response.status === 401) {
      removeToken();
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }
    
    if (!response.ok) {
      let errorMessage = 'STT failed';
      try {
        const errorData = await response.json();
        // Handle different error formats
        if (errorData.detail) {
          // FastAPI error format
          if (Array.isArray(errorData.detail)) {
            // Validation errors
            errorMessage = errorData.detail.map(err => {
              if (typeof err === 'object' && err.msg) {
                return `${err.loc?.join('.') || 'field'}: ${err.msg}`;
              }
              return String(err);
            }).join(', ');
          } else if (typeof errorData.detail === 'string') {
            errorMessage = errorData.detail;
          } else {
            errorMessage = JSON.stringify(errorData.detail);
          }
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else {
          errorMessage = JSON.stringify(errorData);
        }
      } catch (e) {
        // If JSON parse fails, use status text
        errorMessage = response.statusText || 'STT failed';
      }
      throw new Error(errorMessage);
    }
    
    const data = await response.json();
    return data;
  },
};

/**
 * AI API
 */
export const aiAPI = {
  /**
   * Analyze expense using AI
   */
  analyzeExpense: async (expenseData) => {
    return apiRequest('/api/ai/analyze-expense', {
      method: 'POST',
      body: JSON.stringify(expenseData),
    });
  },
};

/**
 * Expense API
 */
export const expenseAPI = {
  /**
   * Create a new expense
   */
  createExpense: async (expenseData) => {
    return apiRequest('/api/expenses', {
      method: 'POST',
      body: JSON.stringify(expenseData),
    });
  },

  /**
   * Get user's expenses
   */
  getExpenses: async (limit = 50, offset = 0) => {
    return apiRequest(`/api/expenses?limit=${limit}&offset=${offset}`, {
      method: 'GET',
    });
  },

  /**
   * Get expenses shared with me
   */
  getSharedExpenses: async (limit = 50, offset = 0) => {
    return apiRequest(`/api/expenses/shared-with-me?limit=${limit}&offset=${offset}`, {
      method: 'GET',
    });
  },

  /**
   * Delete an expense
   */
  deleteExpense: async (expenseId) => {
    return apiRequest(`/api/expenses/${expenseId}`, {
      method: 'DELETE',
    });
  },
};

/**
 * Contacts API
 */
export const contactsAPI = {
  /**
   * Get user's contacts
   */
  getContacts: async () => {
    return apiRequest('/api/contacts', {
      method: 'GET',
    });
  },

  /**
   * Add a new contact
   */
  addContact: async (friendEmail, nickname = null) => {
    return apiRequest('/api/contacts', {
      method: 'POST',
      body: JSON.stringify({
        friend_email: friendEmail,
        nickname: nickname,
      }),
    });
  },

  /**
   * Update a contact's nickname
   */
  updateContact: async (contactId, nickname) => {
    return apiRequest(`/api/contacts/${contactId}`, {
      method: 'PUT',
      body: JSON.stringify({
        nickname: nickname,
      }),
    });
  },

  /**
   * Delete a contact
   */
  deleteContact: async (contactId) => {
    return apiRequest(`/api/contacts/${contactId}`, {
      method: 'DELETE',
    });
  },
};

/**
 * Contact Groups API
 */
export const contactGroupsAPI = {
  /**
   * Get user's contact groups
   */
  getContactGroups: async () => {
    return apiRequest('/api/contact-groups', {
      method: 'GET',
    });
  },

  /**
   * Create a new contact group
   */
  createContactGroup: async (name, description = null, contactIds = [], freeMembers = []) => {
    return apiRequest('/api/contact-groups', {
      method: 'POST',
      body: JSON.stringify({
        name,
        description,
        contact_ids: contactIds,
        free_members: freeMembers,
      }),
    });
  },

  /**
   * Update a contact group
   */
  updateContactGroup: async (groupId, name = null, description = null, contactIds = null, freeMembers = []) => {
    return apiRequest(`/api/contact-groups/${groupId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name,
        description,
        contact_ids: contactIds,
        free_members: freeMembers,
      }),
    });
  },

  /**
   * Delete a contact group
   */
  deleteContactGroup: async (groupId) => {
    return apiRequest(`/api/contact-groups/${groupId}`, {
      method: 'DELETE',
    });
  },
};

/**
 * Splits API
 */
export const splitsAPI = {
  /**
   * Create expense splits
   */
  createSplits: async (expenseId, participants) => {
    return apiRequest(`/api/expenses/${expenseId}/splits`, {
      method: 'POST',
      body: JSON.stringify({
        expense_id: expenseId,
        participants: participants,
      }),
    });
  },

  /**
   * Get expense splits
   */
  getSplits: async (expenseId) => {
    return apiRequest(`/api/expenses/${expenseId}/splits`, {
      method: 'GET',
    });
  },

  /**
   * Send bills to participants
   */
  sendBills: async (expenseId, participantIds) => {
    return apiRequest(`/api/expenses/${expenseId}/send-bills`, {
      method: 'POST',
      body: JSON.stringify({
        expense_id: expenseId,
        participant_ids: participantIds,
      }),
    });
  },
};

export default {
  auth: authAPI,
  ocr: ocrAPI,
  stt: sttAPI,
  ai: aiAPI,
  expense: expenseAPI,
  contacts: contactsAPI,
  contactGroups: contactGroupsAPI,
  splits: splitsAPI,
};

