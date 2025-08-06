import React, { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { View, Role, Permission } from '../types';
import { ICONS } from '../constants';

interface SidebarProps {
    currentView: View;
    setCurrentView: (view: View) => void;
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    role: Role;
    permissions: Permission[];
}

interface NavButtonProps {
    view: View;
    label: string;
    currentView: View;
    onClick: (view: View) => void;
    children: ReactNode;
}

const NavButton = ({ view, label, currentView, onClick, children }: NavButtonProps) => {
    const isActive = currentView === view;
    return (
        <motion.button
            onClick={() => onClick(view)}
            className={`relative flex flex-col md:flex-row items-center md:items-center justify-center md:justify-start w-full text-left md:py-3 md:px-4 py-3 px-2 rounded-lg transition-all duration-200 group ${
                isActive
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-slate-700 dark:text-white font-bold'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-slate-200'
            }`}
            aria-current={isActive ? 'page' : undefined}
            aria-label={label}
            whileHover={{ scale: isActive ? 1 : 1.02 }}
            whileTap={{ scale: 0.95 }}
        >
            {/* Active Indicator: A bold bar that animates to the active item */}
            {isActive && (
                <motion.div
                    layoutId="active-sidebar-indicator"
                    className="absolute left-0 top-2 bottom-2 w-1 bg-emerald-600 rounded-r-full"
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
            )}
            
            <div className="md:ml-2 md:mr-4 flex-shrink-0">
                {children}
            </div>
            <span className={`text-xs md:text-sm mt-1 md:mt-0 ${isActive ? 'font-bold' : 'font-semibold'}`}>{label}</span>
        </motion.button>
    );
};

const NAV_ITEMS: { view: View; label: string; icon: ReactNode; permission: Permission }[] = [
    { view: View.POS, label: 'POS', icon: ICONS.pos, permission: 'view_pos' },
    { view: View.Dashboard, label: 'Dashboard', icon: ICONS.dashboard, permission: 'view_dashboard' },
    { view: View.Inventory, label: 'Inventory', icon: ICONS.inventory, permission: 'view_inventory' },
    { view: View.Purchases, label: 'Purchases', icon: ICONS.purchases, permission: 'view_purchases' },
    { view: View.Quotations, label: 'Quotes', icon: ICONS.quotations, permission: 'view_quotations' },
    { view: View.AccountsPayable, label: 'A/P', icon: ICONS.ap, permission: 'view_ap' },
    { view: View.TaxReports, label: 'Tax', icon: ICONS.tax, permission: 'view_tax_reports' },
    { view: View.ShiftReport, label: 'Shift Report', icon: ICONS.shiftReport, permission: 'view_shift_report' },
    { view: View.Customers, label: 'Customers', icon: ICONS.customers, permission: 'view_customers' },
    { view: View.Staff, label: 'Staff', icon: ICONS.staff, permission: 'view_staff' },
];

const SidebarContent = ({ currentView, setCurrentView, role, permissions }: Omit<SidebarProps, 'isOpen' | 'setIsOpen'>) => {
    
    const allNavItems: { view: View; label: string; icon: ReactNode; permission: Permission }[] = [
        ...NAV_ITEMS,
        { view: View.Settings, label: 'Settings', icon: ICONS.settings, permission: 'view_settings' }
    ];

    const visibleItems = allNavItems.filter(item => permissions.includes(item.permission as Permission));
    
    return (
        <div className="w-full md:w-60 bg-white dark:bg-slate-800 flex flex-col md:p-3 shadow-lg z-20 h-full border-r border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-center md:justify-start h-20 w-full flex-shrink-0 md:px-2">
                <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white text-xl font-bold rounded-lg w-12 h-12 flex items-center justify-center shadow-md flex-shrink-0">
                    K
                </div>
                <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 ml-3 hidden md:block">KenPOS™</h1>
            </div>
            <nav className="w-full flex-grow p-2 md:p-0 flex flex-col space-y-1 overflow-y-auto">
                 {visibleItems.map(item => (
                    <NavButton key={item.view} view={item.view} label={item.label} currentView={currentView} onClick={setCurrentView}>
                        {item.icon}
                    </NavButton>
                ))}
            </nav>
        </div>
    );
};


const Sidebar = ({ currentView, setCurrentView, isOpen, setIsOpen, role, permissions }: SidebarProps) => {
    
    return (
        <>
            {/* Desktop Sidebar */}
            <div className="hidden md:block flex-shrink-0">
                 <SidebarContent currentView={currentView} setCurrentView={setCurrentView} role={role} permissions={permissions} />
            </div>
            
            {/* Mobile Sidebar */}
            <AnimatePresence>
                {isOpen && (
                    <div className="md:hidden">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="fixed inset-0 bg-black bg-opacity-50 z-30"
                            onClick={() => setIsOpen(false)}
                        />
                        <motion.div
                             initial={{ x: '-100%' }}
                             animate={{ x: 0 }}
                             exit={{ x: '-100%' }}
                             transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                             className="fixed top-0 left-0 h-full z-40 w-60"
                        >
                            <SidebarContent currentView={currentView} setCurrentView={(v) => { setCurrentView(v); setIsOpen(false); }} role={role} permissions={permissions} />
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
};

export default Sidebar;