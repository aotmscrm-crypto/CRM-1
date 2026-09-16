import React, { useState, useEffect } from 'react';
import { 
  Briefcase, 
  Plus, 
  Search, 
  RotateCw, 
  Trash2, 
  Edit3, 
  Phone, 
  Mail, 
  Building2, 
  ShieldCheck, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  User, 
  Check, 
  Award,
  Filter,
  UserCheck,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { IoLogoWhatsapp as WhatsApp } from 'react-icons/io5';

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('ALL');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('ALL');

  // Modals & Toast State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editEmployee, setEditEmployee] = useState(null);
  const [deleteEmployee, setDeleteEmployee] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  // Form Fill State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    companyName: 'Zest Eat',
    phone: '',
    role: 'employee',
    designation: 'WhatsApp Campaign Specialist',
    department: 'Sales & Marketing'
  });

  const [phoneError, setPhoneError] = useState('');
  const [emailError, setEmailError] = useState('');

  const getApiBase = () => {
    if (import.meta.env.VITE_API_BASE_URL) {
      return import.meta.env.VITE_API_BASE_URL;
    }
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return 'http://localhost:5000';
    }
    return 'https://crm-1-62pl.onrender.com';
  };

  const showToastMsg = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchEmployees = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`${getApiBase()}/api/users`);
      const data = await res.json();
      if (res.ok && data && data.success && Array.isArray(data.users)) {
        setEmployees(data.users);
      } else {
        setEmployees([]);
      }
    } catch (err) {
      console.error("Failed to fetch employees:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  // Strict 10-Digit Mobile Handler
  const handlePhoneChange = (e, isEdit = false) => {
    const raw = e.target.value;
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('91') && digits.length > 10) {
      digits = digits.slice(2);
    }
    const clean10 = digits.slice(0, 10);

    if (isEdit) {
      setEditEmployee(prev => ({ ...prev, phone: clean10 }));
    } else {
      setFormData(prev => ({ ...prev, phone: clean10 }));
    }

    if (clean10 && clean10.length !== 10) {
      setPhoneError(`Exactly 10 digits required (${clean10.length}/10 entered).`);
    } else if (clean10 && !['6', '7', '8', '9'].includes(clean10[0])) {
      setPhoneError('Indian mobile numbers must start with 6, 7, 8, or 9.');
    } else {
      setPhoneError('');
    }
  };

  const handleEmailChange = (e, isEdit = false) => {
    const val = e.target.value;
    if (isEdit) {
      setEditEmployee(prev => ({ ...prev, email: val }));
    } else {
      setFormData(prev => ({ ...prev, email: val }));
    }

    if (val && val.trim()) {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(val.trim())) {
        setEmailError('Enter a valid email address.');
      } else {
        setEmailError('');
      }
    } else {
      setEmailError('');
    }
  };

  // Create Employee Submit
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim() || !formData.password || !formData.designation.trim()) {
      showToastMsg("Name, Work Email, Password, and Designation are required.", "error");
      return;
    }

    if (phoneError || emailError) {
      showToastMsg("Please resolve validation errors first.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${getApiBase()}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToastMsg(data.message || `Employee '${formData.name}' created successfully!`, "success");
        setShowAddModal(false);
        setFormData({
          name: '',
          email: '',
          password: '',
          companyName: 'Zest Eat',
          phone: '',
          role: 'employee',
          designation: 'WhatsApp Campaign Specialist',
          department: 'Sales & Marketing'
        });
        await fetchEmployees();
      } else {
        throw new Error(data.message || "Failed to create employee.");
      }
    } catch (err) {
      showToastMsg(err.message || "Error creating employee.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Edit Employee Submit
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editEmployee) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${getApiBase()}/api/users/${editEmployee._id || editEmployee.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editEmployee.name,
          email: editEmployee.email,
          companyName: editEmployee.companyName,
          phone: editEmployee.phone,
          role: editEmployee.role,
          designation: editEmployee.designation,
          department: editEmployee.department
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToastMsg(data.message || `Employee '${editEmployee.name}' updated!`, "success");
        setEditEmployee(null);
        await fetchEmployees();
      } else {
        throw new Error(data.message || "Failed to update employee.");
      }
    } catch (err) {
      showToastMsg(err.message || "Error updating employee.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Employee Submit
  const handleDeleteConfirm = async () => {
    if (!deleteEmployee) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${getApiBase()}/api/users/${deleteEmployee._id || deleteEmployee.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToastMsg(`Employee '${deleteEmployee.name}' deleted successfully.`, "success");
        setDeleteEmployee(null);
        await fetchEmployees();
      } else {
        throw new Error(data.message || "Failed to delete employee.");
      }
    } catch (err) {
      showToastMsg(err.message || "Error deleting employee.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Filter Employees
  const filteredEmployees = employees.filter(emp => {
    const roleMatches = selectedRoleFilter === 'ALL' || emp.role === selectedRoleFilter;
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      (emp.name || '').toLowerCase().includes(query) ||
      (emp.email || '').toLowerCase().includes(query) ||
      (emp.phone || '').toLowerCase().includes(query) ||
      (emp.companyName || '').toLowerCase().includes(query) ||
      (emp.designation || '').toLowerCase().includes(query) ||
      (emp.department || '').toLowerCase().includes(query);

    return roleMatches && matchesSearch;
  });

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 12;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedRoleFilter, selectedDeptFilter]);

  const totalPages = Math.ceil(filteredEmployees.length / ITEMS_PER_PAGE) || 1;
  const paginatedEmployees = filteredEmployees.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      
      {/* Toast Banner */}
      {toast && (
        <div className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between shadow-md transition-all animate-in fade-in ${
          toast.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
        }`}>
          <div className="flex items-center gap-2.5">
            {toast.type === 'error' ? <AlertCircle className="w-4 h-4 text-rose-600" /> : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
            <span>{toast.msg}</span>
          </div>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-slate-900 to-indigo-900 text-white flex items-center justify-center shadow-md">
            <Briefcase className="w-5 h-5 text-tech_orange" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-900 tracking-tight">
                Company Employee Directory & Designation Work
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-900 text-white font-mono">
                {filteredEmployees.length} Active Employees
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage employee profiles, company designations, departments, contact details, and system panel roles.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setFormData({
                name: '',
                email: '',
                password: '',
                companyName: 'Zest Eat',
                phone: '',
                role: 'employee',
                designation: 'WhatsApp Campaign Specialist',
                department: 'Sales & Marketing'
              });
              setPhoneError('');
              setEmailError('');
              setShowAddModal(true);
            }}
            className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 text-tech_orange" />
            <span>Add Employee</span>
          </button>
        </div>
      </div>

      {/* Search & Role Filter Toolbar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by employee name, designation, email, company..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-sky-500 shadow-2xs"
          />
        </div>

        {/* Role Filters */}
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mr-1 shrink-0">
            <ShieldCheck className="w-3.5 h-3.5 text-sky-600" /> Role:
          </span>
          {['ALL', 'admin', 'manager', 'employee'].map((roleKey) => (
            <button
              key={roleKey}
              onClick={() => setSelectedRoleFilter(roleKey)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                selectedRoleFilter === roleKey
                  ? 'bg-slate-900 text-white shadow-xs font-mono'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 font-medium'
              }`}
            >
              {roleKey === 'ALL' ? 'All Roles' : roleKey.toUpperCase()}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={fetchEmployees}
          disabled={refreshing}
          className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200 shadow-2xs shrink-0"
        >
          <RotateCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-sky-600' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* EMPLOYEE CARDS GRID */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-sm">
          <RotateCw className="w-6 h-6 animate-spin text-sky-600 mx-auto mb-2" />
          <p className="text-xs text-slate-500 font-semibold">Loading employee team records from MongoDB...</p>
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center mx-auto">
            <Briefcase className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">No Employees Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Add team members to assign company designations, roles, and work responsibilities.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs inline-flex items-center gap-2 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4 text-tech_orange" />
            <span>Add First Employee</span>
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {paginatedEmployees.map((emp) => {
              const initials = emp.name ? emp.name.charAt(0).toUpperCase() : 'E';
              const cleanPhone = (emp.phone || '').replace(/\D/g, '');

              const roleBadgeStyle = {
                admin: 'bg-rose-100 text-rose-800 border-rose-300',
                manager: 'bg-purple-100 text-purple-800 border-purple-300',
                employee: 'bg-sky-100 text-sky-800 border-sky-300',
                user: 'bg-slate-100 text-slate-800 border-slate-300'
              }[emp.role] || 'bg-slate-100 text-slate-800 border-slate-300';

              return (
                <div
                  key={emp._id || emp.id}
                  className="bg-white rounded-3xl border border-slate-200 shadow-xs hover:shadow-xl hover:border-sky-300 transition-all duration-200 p-6 flex flex-col justify-between space-y-4 group relative overflow-hidden"
                >
                  {/* Top Accent Gradient Bar */}
                  <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-sky-500 via-tech_orange to-amber-500" />

                  <div className="space-y-4 pt-1">
                    
                    {/* Header Avatar & Role Chip */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white flex items-center justify-center text-lg font-black shadow-md shrink-0 group-hover:scale-105 transition-transform">
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-black text-slate-900 text-base truncate group-hover:text-sky-600 transition-colors">
                            {emp.name}
                          </h3>
                          <p className="text-xs text-tech_orange font-bold font-mono truncate">
                            {emp.designation || 'Team Member'}
                          </p>
                        </div>
                      </div>

                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-black uppercase tracking-wider shrink-0 border ${roleBadgeStyle}`}>
                        {emp.role || 'employee'}
                      </span>
                    </div>

                    {/* Department Tag */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Department</span>
                      <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-extrabold text-[11px] border border-slate-200">
                        {emp.department || 'General'}
                      </span>
                    </div>

                    {/* Contact Info Box */}
                    <div className="space-y-2 text-xs p-3 rounded-2xl bg-slate-50 border border-slate-200/80">
                      <div className="flex items-center justify-between gap-2 truncate">
                        <span className="text-slate-400 font-bold uppercase text-[10px]">Email:</span>
                        <span className="font-semibold text-slate-800 truncate" title={emp.email}>{emp.email}</span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-400 font-bold uppercase text-[10px]">Phone:</span>
                        <span className="font-bold text-slate-900 font-mono">+91 {emp.phone}</span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-400 font-bold uppercase text-[10px]">Company:</span>
                        <span className="font-semibold text-slate-700">{emp.companyName || 'AOTMS'}</span>
                      </div>
                    </div>

                  </div>

                  {/* Actions Bar */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    {cleanPhone ? (
                      <a
                        href={`https://wa.me/${cleanPhone.startsWith('91') ? cleanPhone : '91' + cleanPhone}`}
                        target="_blank"
                        rel="noreferrer"
                        className="py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-xs flex items-center gap-1.5 transition-colors"
                        title="Chat on WhatsApp"
                      >
                        <WhatsApp className="w-4 h-4 text-emerald-600" />
                        <span>WhatsApp</span>
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400 font-medium">No Direct Chat</span>
                    )}

                    <div className="flex items-center gap-1.5 ml-auto">
                      <button
                        type="button"
                        onClick={() => setEditEmployee({ ...emp })}
                        className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
                        title="Edit Employee Designation & Profile"
                      >
                        <Edit3 className="w-4 h-4 text-sky-600" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeleteEmployee(emp)}
                        className="p-2 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 border border-slate-200 transition-colors cursor-pointer"
                        title="Delete Employee Record"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>

          {/* Pagination Footer Controls */}
          {filteredEmployees.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs gap-3">
              <div className="text-xs font-bold text-slate-500">
                Showing <span className="text-slate-900 font-extrabold">{paginatedEmployees.length > 0 ? (currentPage - 1) * ITEMS_PER_PAGE + 1 : 0}</span> to <span className="text-slate-900 font-extrabold">{Math.min(currentPage * ITEMS_PER_PAGE, filteredEmployees.length)}</span> of <span className="text-slate-900 font-extrabold">{filteredEmployees.length}</span> employees
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-extrabold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all flex items-center gap-1.5 shadow-2xs"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Previous</span>
                </button>

                <span className="px-3.5 py-1.5 text-xs font-black text-slate-900 bg-slate-100 rounded-lg font-mono">
                  Page {currentPage} of {totalPages}
                </span>

                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                  disabled={currentPage >= totalPages}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-extrabold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all flex items-center gap-1.5 shadow-2xs"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ADD EMPLOYEE COMPANY FORM                                        */}
      {/* ========================================================================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="relative w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 sm:p-8 space-y-5 my-auto text-slate-900">
            
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-md">
                  <Briefcase className="w-5 h-5 text-tech_orange" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">Add New Employee</h3>
                  <p className="text-xs text-slate-500 font-medium">Assign company designation, department, and system access role.</p>
                </div>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} id="employee-add-form" className="space-y-4 text-xs font-medium">
              
              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Employee Full Name <span className="text-rose-500 font-bold">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sneha Agarwal"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs placeholder-slate-400 focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Work Email & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Work Email <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="sneha@aotms.com"
                    value={formData.email}
                    onChange={(e) => handleEmailChange(e, false)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs placeholder-slate-400 focus:outline-none focus:border-sky-500"
                  />
                  {emailError && <p className="text-[10px] text-rose-600 font-semibold mt-1">{emailError}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Mobile Phone Number (+91)
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-slate-400 font-mono font-bold text-xs">+91</span>
                    <input
                      type="text"
                      maxLength={10}
                      placeholder="9876543210"
                      value={formData.phone}
                      onChange={(e) => handlePhoneChange(e, false)}
                      className="w-full pl-12 pr-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 font-mono text-xs placeholder-slate-400 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  {phoneError && <p className="text-[10px] text-rose-600 font-semibold mt-1">{phoneError}</p>}
                </div>
              </div>

              {/* Company Name & Designation Work */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Company Name <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Zest Eat"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs placeholder-slate-400 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Designation Work <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Campaign Specialist"
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs placeholder-slate-400 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Department & System Role */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Operations / Sales"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs placeholder-slate-400 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    System Panel Access Role
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs font-semibold focus:outline-none focus:border-sky-500"
                  >
                    <option value="employee">Employee Panel (Limited)</option>
                    <option value="manager">Manager Panel (Standard)</option>
                    <option value="admin">Admin Panel (Full Control)</option>
                  </select>
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Access Password <span className="text-rose-500 font-bold">*</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="Set account password..."
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs placeholder-slate-400 focus:outline-none focus:border-sky-500"
                />
              </div>

            </form>

            <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="employee-add-form"
                disabled={submitting}
                className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs flex items-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {submitting ? <RotateCw className="w-4 h-4 animate-spin text-tech_orange" /> : <CheckCircle2 className="w-4 h-4 text-tech_orange" />}
                <span>{submitting ? 'Saving Employee...' : 'Save Employee Profile'}</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: EDIT EMPLOYEE DESIGNATION & PROFILE                              */}
      {/* ========================================================================= */}
      {editEmployee && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="relative w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 sm:p-8 space-y-5 my-auto text-slate-900">
            
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shadow-md">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">Edit Employee Designation</h3>
                  <p className="text-xs text-slate-500 font-medium">Update designation work, company name, or contact information.</p>
                </div>
              </div>
              <button onClick={() => setEditEmployee(null)} className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} id="employee-edit-form" className="space-y-4 text-xs font-medium">
              
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">Employee Name</label>
                <input
                  type="text"
                  required
                  value={editEmployee.name || ''}
                  onChange={(e) => setEditEmployee({ ...editEmployee, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">Designation Work</label>
                  <input
                    type="text"
                    required
                    value={editEmployee.designation || ''}
                    onChange={(e) => setEditEmployee({ ...editEmployee, designation: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">Company Name</label>
                  <input
                    type="text"
                    required
                    value={editEmployee.companyName || ''}
                    onChange={(e) => setEditEmployee({ ...editEmployee, companyName: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">Department</label>
                  <input
                    type="text"
                    value={editEmployee.department || ''}
                    onChange={(e) => setEditEmployee({ ...editEmployee, department: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">System Role</label>
                  <select
                    value={editEmployee.role || 'employee'}
                    onChange={(e) => setEditEmployee({ ...editEmployee, role: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs font-semibold focus:outline-none focus:border-sky-500"
                  >
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">Mobile Phone Number (+91)</label>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-slate-400 font-mono font-bold text-xs">+91</span>
                  <input
                    type="text"
                    maxLength={10}
                    value={editEmployee.phone || ''}
                    onChange={(e) => handlePhoneChange(e, true)}
                    className="w-full pl-12 pr-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 font-mono text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

            </form>

            <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditEmployee(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="employee-edit-form"
                disabled={submitting}
                className="px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-extrabold text-xs flex items-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {submitting ? <RotateCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>{submitting ? 'Updating...' : 'Update Designation'}</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: DELETE CONFIRMATION                                              */}
      {/* ========================================================================= */}
      {deleteEmployee && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="relative w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 space-y-4 my-auto text-slate-900">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-extrabold text-slate-900">Delete Employee Profile</h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to remove employee <span className="font-bold text-slate-800">'{deleteEmployee.name}'</span> ({deleteEmployee.designation}) from database?
              </p>
            </div>
            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setDeleteEmployee(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={submitting}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
              >
                {submitting ? <RotateCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>{submitting ? 'Deleting...' : 'Confirm Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
