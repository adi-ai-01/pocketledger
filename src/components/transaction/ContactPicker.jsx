import { useState, useMemo, useEffect, useRef } from 'react';
import { User, Phone, AtSign, Plus, Check, AlertTriangle, AlertCircle, X, Search } from 'lucide-react';
import { isValidUpiId } from '../../domain/store-core.js';
import { isValidPhoneNumber, cleanPhoneNumber } from '../../domain/upi-qr.js';

export default function ContactPicker({
  value = '',
  onChange,
  people = [],
  balances = {},
  currency = '₹',
  placeholder = 'Select or add person',
  excludePersonIds = [],
  store = null,
  label = null,
  required = false,
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // New Contact form state
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newUpiId, setNewUpiId] = useState('');
  const [addError, setAddError] = useState(null);
  const [duplicateWarning, setDuplicateWarning] = useState(null);

  const containerRef = useRef(null);

  // Selected person resolution
  const selectedName = typeof value === 'string' ? value : value?.name || value?.person || '';
  const selectedId = typeof value === 'object' ? value?.id || value?.personId : '';

  // Get canonical directory combining passed people and store
  const allPeople = useMemo(() => {
    const list = store?.getPeopleDirectory ? store.getPeopleDirectory() : people;
    // ensure unique by id or name
    const map = new Map();
    for (const p of list || []) {
      if (!p) continue;
      const key = p.id || p.name;
      if (!map.has(key)) map.set(key, p);
    }
    return Array.from(map.values());
  }, [store, people]);

  const selectedPerson = useMemo(() => {
    if (selectedId) {
      const byId = allPeople.find((p) => p.id === selectedId);
      if (byId) return byId;
    }
    if (selectedName) {
      const byName = allPeople.find(
        (p) => p.name.trim().toLowerCase() === selectedName.trim().toLowerCase()
      );
      if (byName) return byName;
    }
    return null;
  }, [allPeople, selectedId, selectedName]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtered contacts based on search query (by name or phone)
  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const cleanQPhone = cleanPhoneNumber(searchQuery);

    return allPeople.filter((p) => {
      if (excludePersonIds.includes(p.id) && p.id !== selectedPerson?.id) {
        return false;
      }
      if (!q) return true;

      const nameMatch = p.name.toLowerCase().includes(q);
      const phoneMatch = p.phone && (
        p.phone.includes(q) ||
        (cleanQPhone.length >= 3 && cleanPhoneNumber(p.phone).includes(cleanQPhone))
      );
      const upiMatch = p.upiId && p.upiId.toLowerCase().includes(q);

      return nameMatch || phoneMatch || upiMatch;
    });
  }, [allPeople, searchQuery, excludePersonIds, selectedPerson]);

  const handleSelect = (personObj) => {
    onChange({
      id: personObj.id,
      personId: personObj.id,
      name: personObj.name,
      person: personObj.name,
      phone: personObj.phone || '',
      upiId: personObj.upiId || '',
      balanceRupees: balances[personObj.name] ?? personObj.balanceRupees ?? 0,
      isNew: false,
    });
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = () => {
    onChange({
      id: '',
      personId: '',
      name: '',
      person: '',
      phone: '',
      upiId: '',
      balanceRupees: 0,
      isNew: false,
    });
    setSearchQuery('');
  };

  const handleOpenAddModal = (initialName = '') => {
    setNewName(initialName || searchQuery);
    setNewPhone('');
    setNewUpiId('');
    setAddError(null);
    setDuplicateWarning(null);
    setShowAddModal(true);
    setIsOpen(false);
  };

  // Check duplicate on name/phone change
  const checkForDuplicates = (nameVal, phoneVal) => {
    const trimmedName = nameVal.trim().toLowerCase();
    const cleanedP = cleanPhoneNumber(phoneVal);

    let match = null;
    let reason = '';

    if (trimmedName) {
      match = allPeople.find((p) => p.name.trim().toLowerCase() === trimmedName);
      if (match) reason = `Same name as existing contact '${match.name}'`;
    }

    if (!match && cleanedP && cleanedP.length >= 10) {
      match = allPeople.find((p) => p.phone && cleanPhoneNumber(p.phone) === cleanedP);
      if (match) reason = `Same phone number as existing contact '${match.name}'`;
    }

    if (match) {
      setDuplicateWarning({ match, reason });
    } else {
      setDuplicateWarning(null);
    }
  };

  const handleSaveNewContact = (forceNew = false) => {
    const trimmedName = newName.trim();
    if (!trimmedName) {
      setAddError('Person name is required');
      return;
    }

    if (newPhone.trim() && !isValidPhoneNumber(newPhone)) {
      setAddError('Please enter a valid phone number (10+ digits)');
      return;
    }

    if (newUpiId.trim() && !isValidUpiId(newUpiId)) {
      setAddError('Invalid UPI ID format. Expected format: username@bank');
      return;
    }

    if (duplicateWarning && !forceNew) {
      // Prompt user to either choose existing or force create
      return;
    }

    let createdPerson = null;

    if (store?.createExplicitPerson) {
      const res = store.createExplicitPerson({
        name: trimmedName,
        phone: cleanPhoneNumber(newPhone),
        upiId: newUpiId.trim(),
        force: forceNew,
      });
      if (!res.success) {
        setAddError(res.error || 'Failed to save person');
        return;
      }
      createdPerson = res.person;
    } else if (store?.addPerson) {
      const res = store.addPerson({
        name: trimmedName,
        phone: cleanPhoneNumber(newPhone),
        upiId: newUpiId.trim(),
        force: forceNew,
      });
      if (res && res.success === false) {
        setAddError(res.error || 'Failed to add person');
        return;
      }
      createdPerson = res?.person || {
        id: `person_${Date.now()}`,
        name: trimmedName,
        phone: cleanPhoneNumber(newPhone),
        upiId: newUpiId.trim(),
      };
    } else {
      // In-memory fallback
      createdPerson = {
        id: `person_${Date.now()}`,
        name: trimmedName,
        phone: cleanPhoneNumber(newPhone),
        upiId: newUpiId.trim(),
      };
    }

    onChange({
      id: createdPerson.id,
      personId: createdPerson.id,
      name: createdPerson.name,
      person: createdPerson.name,
      phone: createdPerson.phone || '',
      upiId: createdPerson.upiId || '',
      balanceRupees: 0,
      isNew: true,
    });

    setShowAddModal(false);
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      {label && (
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
          {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}

      {/* Selected Contact View */}
      {selectedPerson || selectedName ? (
        <div className="flex items-center justify-between p-2.5 px-3 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0">
              {(selectedPerson?.name || selectedName).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-medium text-sm text-zinc-100 truncate">
                  {selectedPerson?.name || selectedName}
                </span>
                {selectedPerson?.id && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                    Linked
                  </span>
                )}
                {selectedPerson?.upiId && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
                    UPI
                  </span>
                )}
                {selectedPerson?.phone && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
                    Phone
                  </span>
                )}
              </div>
              <div className="text-[11px] text-zinc-400 truncate">
                {selectedPerson?.upiId ? selectedPerson.upiId : selectedPerson?.phone ? selectedPerson.phone : 'No details saved'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {balances[selectedPerson?.name || selectedName] !== undefined && (
              <span
                className={`text-xs font-semibold ${
                  balances[selectedPerson?.name || selectedName] > 0
                    ? 'text-emerald-400'
                    : balances[selectedPerson?.name || selectedName] < 0
                    ? 'text-red-400'
                    : 'text-zinc-500'
                }`}
              >
                {balances[selectedPerson?.name || selectedName] > 0
                  ? `+${currency}${Math.abs(balances[selectedPerson?.name || selectedName])}`
                  : balances[selectedPerson?.name || selectedName] < 0
                  ? `-${currency}${Math.abs(balances[selectedPerson?.name || selectedName])}`
                  : `${currency}0`}
              </span>
            )}
            {!disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Empty / Search View */
        <div className="relative">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 pointer-events-none" />
            <input
              type="text"
              placeholder={placeholder}
              value={searchQuery}
              disabled={disabled}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              className="w-full h-11 pl-9 pr-10 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 placeholder:text-zinc-500 text-sm focus:border-emerald-500 outline-none transition disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => handleOpenAddModal(searchQuery)}
              className="absolute right-2 p-1.5 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition"
              title="Add new contact"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Autocomplete Dropdown */}
          {isOpen && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-50 max-h-60 overflow-y-auto divide-y divide-zinc-800/60">
              {/* Quick Add Option */}
              {searchQuery.trim() && (
                <button
                  type="button"
                  onClick={() => handleOpenAddModal(searchQuery.trim())}
                  className="w-full p-2.5 px-3 flex items-center gap-2.5 text-left bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-400 transition"
                >
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <Plus className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold">
                      Add &ldquo;{searchQuery.trim()}&rdquo; as new person
                    </div>
                    <div className="text-[10px] text-zinc-400">Save with phone and UPI details</div>
                  </div>
                </button>
              )}

              {/* Contact list */}
              {filteredContacts.length > 0 ? (
                filteredContacts.map((p) => {
                  const bal = balances[p.name] ?? p.balanceRupees ?? 0;
                  return (
                    <button
                      key={p.id || p.name}
                      type="button"
                      onClick={() => handleSelect(p)}
                      className="w-full p-2.5 px-3 flex items-center justify-between text-left hover:bg-zinc-800/60 transition group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center font-bold text-xs shrink-0 group-hover:bg-zinc-700">
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-xs text-zinc-200 truncate group-hover:text-zinc-100">
                              {p.name}
                            </span>
                            {p.id && (
                              <span className="px-1 py-0.2 rounded text-[9px] font-semibold bg-emerald-500/10 text-emerald-400">
                                Linked
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-zinc-500 truncate flex items-center gap-2">
                            {p.upiId && <span>{p.upiId}</span>}
                            {p.phone && <span>{p.phone}</span>}
                            {!p.upiId && !p.phone && <span>No details</span>}
                          </div>
                        </div>
                      </div>

                      {bal !== 0 && (
                        <span
                          className={`text-xs font-semibold shrink-0 ml-2 ${
                            bal > 0 ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {bal > 0 ? `+${currency}${Math.abs(bal)}` : `-${currency}${Math.abs(bal)}`}
                        </span>
                      )}
                    </button>
                  );
                })
              ) : (
                !searchQuery.trim() && (
                  <div className="p-4 text-center text-xs text-zinc-500">
                    No contacts saved yet. Click + to add your first contact.
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )}

      {/* Add New Contact Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-2xl text-zinc-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-400" />
                <h4 className="text-sm font-semibold">New Contact</h4>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {addError && (
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{addError}</span>
              </div>
            )}

            {duplicateWarning && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs space-y-2">
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>Existing Contact Found</span>
                </div>
                <p className="text-[11px] text-amber-200/80">
                  {duplicateWarning.reason}. You can link to this existing contact or create a separate distinct person.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      handleSelect(duplicateWarning.match);
                      setShowAddModal(false);
                    }}
                    className="flex-1 py-1.5 px-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-medium border border-amber-500/30 transition text-center"
                  >
                    Use Existing ({duplicateWarning.match.name})
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Full Name <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => {
                      setNewName(e.target.value);
                      checkForDuplicates(e.target.value, newPhone);
                    }}
                    placeholder="e.g. Diya Patel"
                    className="w-full h-9 pl-8 pr-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500 outline-none"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Phone Number <span className="text-zinc-500">(Optional)</span>
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => {
                      setNewPhone(e.target.value);
                      checkForDuplicates(newName, e.target.value);
                    }}
                    placeholder="e.g. +91 98765 43210"
                    className="w-full h-9 pl-8 pr-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  UPI ID <span className="text-zinc-500">(Optional)</span>
                </label>
                <div className="relative">
                  <AtSign className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="text"
                    value={newUpiId}
                    onChange={(e) => setNewUpiId(e.target.value)}
                    placeholder="e.g. diya@okaxis"
                    className="w-full h-9 pl-8 pr-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="flex-1 h-9 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-xs transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveNewContact(Boolean(duplicateWarning))}
                className="flex-1 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition"
              >
                {duplicateWarning ? 'Add As Distinct' : 'Save Contact'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
