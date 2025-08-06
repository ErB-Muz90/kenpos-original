import React, { useState, useMemo, useEffect, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CartItem, SaleData, Payment, Customer, Settings } from '../../types';
import { calculateCartTotals } from '../../utils/vatCalculator';

interface PaymentModalProps {
    cartItems: CartItem[];
    discount: { type: 'percentage' | 'fixed', value: number };
    onClose: () => void;
    onCompleteSale: (sale: SaleData, options?: { autoPrint?: boolean }) => void;
    customer: Customer;
    settings: Settings;
}

type PaymentType = 'M-Pesa' | 'Cash' | 'Card' | 'Split';
type StkState = 'prompting' | 'sending' | 'waiting' | 'success' | 'failure';

const PaymentModal = ({ cartItems, discount, onClose, onCompleteSale, customer, settings }: PaymentModalProps) => {
    const [paymentType, setPaymentType] = useState<PaymentType>('Cash');
    const [splitPayments, setSplitPayments] = useState<Payment[]>([{ method: 'Cash', amount: 0 }]);
    const [cashReceived, setCashReceived] = useState<number | ''>('');
    
    // M-Pesa STK Push State
    const [stkState, setStkState] = useState<StkState>('prompting');
    const [phoneNumber, setPhoneNumber] = useState(customer.phone !== 'N/A' ? customer.phone : '');
    const [transactionCode, setTransactionCode] = useState<string | null>(null);
    const [stkError, setStkError] = useState<string | null>(null);

    // Loyalty Points State
    const [pointsToRedeem, setPointsToRedeem] = useState(0);
    const loyaltySettings = settings.loyalty;
    
    const { subtotal, discountAmount, tax, total } = useMemo(
        () => calculateCartTotals(cartItems, discount, settings.tax.vatRate / 100),
        [cartItems, discount, settings.tax.vatRate]
    );

    const redeemedPointsValue = useMemo(() => {
        return pointsToRedeem * loyaltySettings.redemptionRate;
    }, [pointsToRedeem, loyaltySettings.redemptionRate]);

    const amountDue = useMemo(() => total - redeemedPointsValue, [total, redeemedPointsValue]);
    
    const maxRedeemableValue = total * (loyaltySettings.maxRedemptionPercentage / 100);
    const maxRedeemablePoints = Math.min(customer.loyaltyPoints, Math.floor(maxRedeemableValue / loyaltySettings.redemptionRate));


    const totalPaid = useMemo(() => {
        if (paymentType === 'Split') {
            return splitPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
        }
        if (paymentType === 'Cash') {
            return typeof cashReceived === 'number' ? cashReceived : 0;
        }
        // For other types, total paid isn't tracked via input fields here.
        return 0;
    }, [paymentType, splitPayments, cashReceived]);

    const remainingBalance = useMemo(() => amountDue - totalPaid, [amountDue, totalPaid]);
    const change = useMemo(() => (paymentType === 'Cash' && remainingBalance < 0) ? -remainingBalance : 0, [paymentType, remainingBalance]);
    
    const canComplete = useMemo(() => {
        if (amountDue === 0) return true; // Fully paid by points
        if (paymentType === 'M-Pesa') {
            return stkState === 'success';
        }
        if (paymentType === 'Card') {
            return true; // For Card, we assume payment is handled externally
        }
        // For Cash and Split payments, check the balance with a small tolerance for floating point issues.
        return remainingBalance <= 0.001;
    }, [paymentType, remainingBalance, stkState, amountDue]);

    const handleSendStkPush = () => {
        if (!settings.communication.mpesa.enabled) {
            setStkError("M-Pesa payment is not configured in settings.");
            return;
        }
        if (!/^(07|01|2547|2541)\d{8}$/.test(phoneNumber.replace(/\s+/g, ''))) {
            setStkError("Please enter a valid Kenyan phone number (e.g., 0712345678).");
            return;
        }
        setStkError(null);
        setStkState('sending');
        // --- SIMULATION ---
        setTimeout(() => {
            setStkState('waiting');
            setTimeout(() => {
                if (Math.random() > 0.15) { // 85% success rate
                    setStkState('success');
                    setTransactionCode(`SDA${Math.random().toString().slice(2, 12).toUpperCase()}`);
                } else {
                    setStkState('failure');
                    setStkError("Transaction failed. The customer may have cancelled or timed out.");
                }
            }, 8000); // Wait 8 seconds for customer to input PIN
        }, 2000); // 2 seconds to send the request
    };

    const handleComplete = () => {
        if (!canComplete) return;
        let autoPrint = false;
        let payments: Payment[] = [];
        if (redeemedPointsValue > 0) {
            payments.push({ method: 'Points', amount: redeemedPointsValue });
        }

        if (paymentType === 'Split') {
            payments = [...payments, ...splitPayments.filter(p => p.amount > 0)];
        } else if (paymentType === 'Cash') {
            payments.push({ method: 'Cash', amount: totalPaid - change });
        } else if (paymentType === 'M-Pesa') {
            autoPrint = true;
            payments.push({
                method: 'M-Pesa',
                amount: amountDue,
                details: {
                    transactionCode: transactionCode || 'N/A',
                    phoneNumber: phoneNumber
                }
            });
        } else if (paymentType === 'Card') {
            payments.push({ method: paymentType, amount: amountDue });
        }

        const newSale: SaleData = {
            items: cartItems,
            subtotal,
            discountAmount,
            tax,
            total,
            payments,
            change,
            customerId: customer.id,
            date: new Date(),
            pointsUsed: pointsToRedeem,
            pointsValue: redeemedPointsValue,
        };
        onCompleteSale(newSale, { autoPrint });
    };

    const handlePointsRedemptionChange = (points: number) => {
        const validatedPoints = Math.max(0, Math.min(points, maxRedeemablePoints));
        setPointsToRedeem(validatedPoints);
    };

    const PaymentButton = ({ method, children }: { method: PaymentType, children: ReactNode }) => (
        <motion.button
            onClick={() => setPaymentType(method)}
            whileTap={{ scale: 0.97 }}
            className={`flex-1 p-4 rounded-lg text-center font-bold transition-all duration-200 border-2 ${
                paymentType === method
                    ? 'bg-emerald-500 border-emerald-600 text-white shadow-lg'
                    : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
            }`}
        >
            {children}
        </motion.button>
    );
    
    const showLoyalty = loyaltySettings.enabled && customer.id !== 'cust001' && customer.loyaltyPoints >= loyaltySettings.minRedeemablePoints;

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
            <motion.div initial={{ scale: 0.9, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.9, y: 20, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-8 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-slate-800">Complete Payment</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-800"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>

                <div className="bg-slate-100 p-6 rounded-lg mb-6 text-center">
                    <p className="text-slate-600 text-lg">Total Amount</p>
                    <p className="text-5xl font-extrabold text-emerald-600 tracking-tight">Ksh {total.toFixed(2)}</p>
                </div>
                
                {showLoyalty && (
                     <AnimatePresence>
                        <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg space-y-3">
                            <h4 className="font-bold text-indigo-800">Redeem Loyalty Points</h4>
                            <p className="text-sm text-indigo-700">
                                {customer.name} has <span className="font-bold">{customer.loyaltyPoints} points</span> available (Value: Ksh {(customer.loyaltyPoints * loyaltySettings.redemptionRate).toFixed(2)}).
                            </p>
                            <div className="flex items-center space-x-2">
                                <input type="number" value={pointsToRedeem} onChange={(e) => handlePointsRedemptionChange(parseInt(e.target.value) || 0)} max={maxRedeemablePoints} className="block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
                                <button onClick={() => handlePointsRedemptionChange(maxRedeemablePoints)} className="text-sm font-bold text-indigo-600 whitespace-nowrap">Redeem Max</button>
                            </div>
                            {redeemedPointsValue > 0 && <p className="text-sm text-indigo-600 font-bold text-right">- Ksh {redeemedPointsValue.toFixed(2)}</p>}
                        </motion.div>
                     </AnimatePresence>
                )}

                {amountDue > 0 ? (
                    <>
                        <div className="bg-green-50 p-4 rounded-lg mb-6 text-center">
                            <p className="text-slate-600 text-lg">Amount Due</p>
                            <p className="text-4xl font-extrabold text-green-700 tracking-tight">Ksh {amountDue.toFixed(2)}</p>
                        </div>
                        <div className="flex space-x-2 mb-6">
                            <PaymentButton method="Cash">Cash</PaymentButton>
                            <PaymentButton method="M-Pesa">M-Pesa STK</PaymentButton>
                            <PaymentButton method="Card">Card</PaymentButton>
                        </div>
                        {paymentType === 'M-Pesa' && (
                             <div className="space-y-4 p-4 border rounded-lg bg-slate-50">
                                {stkState === 'prompting' && <>
                                    <label htmlFor="phone" className="block text-sm font-medium text-slate-700">Customer Phone Number</label>
                                    <input id="phone" type="tel" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="e.g., 0712345678" className="block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 text-lg" />
                                    {stkError && <p className="text-sm text-red-600">{stkError}</p>}
                                    <button onClick={handleSendStkPush} className="w-full bg-green-600 text-white font-bold py-3 rounded-lg hover:bg-green-700">Send STK Push</button>
                                </>}
                                {stkState === 'sending' && <div className="text-center p-4"><p className="font-bold animate-pulse">Sending STK Push...</p></div>}
                                {stkState === 'waiting' && <div className="text-center p-4"><p className="font-bold animate-pulse">Waiting for customer to enter PIN...</p></div>}
                                {stkState === 'success' && <div className="text-center p-4 bg-green-100 rounded-lg">
                                    <p className="font-bold text-green-800">Payment Received!</p>
                                    <p className="text-sm text-slate-600">Ref: {transactionCode}</p>
                                </div>}
                                {stkState === 'failure' && <div className="text-center p-4 bg-red-100 rounded-lg">
                                    <p className="font-bold text-red-800">Payment Failed</p>
                                    <p className="text-sm text-slate-600 mb-2">{stkError}</p>
                                    <button onClick={() => setStkState('prompting')} className="text-sm bg-slate-600 text-white font-semibold py-1 px-3 rounded-md hover:bg-slate-700">Retry</button>
                                </div>}
                            </div>
                        )}
                        {paymentType === 'Card' && <div className="bg-blue-50 p-4 rounded-lg text-center border border-blue-200"><p className="text-blue-800 font-bold">Use POS terminal to complete transaction.</p></div>}
                        {paymentType === 'Cash' && 
                            <div>
                                <label className="block text-sm font-medium text-slate-700">Cash Received</label>
                                <div className="mt-1 flex gap-2">
                                <input type="number" value={cashReceived} onChange={e => setCashReceived(e.target.value === '' ? '' : parseFloat(e.target.value))} placeholder={`Enter amount...`} className="block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 text-lg" />
                                <motion.button type="button" onClick={() => setCashReceived(amountDue)} whileTap={{scale: 0.95}} className="px-4 py-2 bg-slate-200 text-slate-700 font-bold rounded-md hover:bg-slate-300 transition-colors">Exact</motion.button>
                                </div>
                            </div>
                        }
                        
                         {(paymentType === 'Cash') && (
                            <div className="mt-6 bg-slate-50 p-4 rounded-lg space-y-2">
                                <div className="flex justify-between font-bold"><span className="text-slate-600">Total Paid</span><span>Ksh {totalPaid.toFixed(2)}</span></div>
                                {change > 0 && <div className="flex justify-between font-bold text-blue-600"><span>Change Due</span><span>Ksh {change.toFixed(2)}</span></div>}
                                {remainingBalance > 0 && <div className="flex justify-between font-bold text-red-600"><span>Remaining</span><span>Ksh {remainingBalance.toFixed(2)}</span></div>}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="bg-green-50 p-4 rounded-lg text-center border border-green-200">
                        <p className="text-green-800 font-bold">Fully paid with loyalty points!</p>
                    </div>
                )}
                
                <motion.button onClick={handleComplete} disabled={!canComplete} whileTap={{ scale: 0.98 }} className="w-full mt-8 bg-emerald-600 text-white font-bold py-4 rounded-lg text-lg hover:bg-emerald-700 transition-colors shadow-lg disabled:bg-slate-400 disabled:cursor-not-allowed">
                    Confirm & Finalize Sale
                </motion.button>
            </motion.div>
        </motion.div>
    );
};

export default PaymentModal;