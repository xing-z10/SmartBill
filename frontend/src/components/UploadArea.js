import React from 'react';
import { Upload } from 'lucide-react';

const UploadArea = ({ onFileSelect, selectedFile, manualTotal, onManualTotalChange }) => (
  <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-16">
    <div className="flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-6">
        <Upload size={32} />
      </div>

      <h3 className="text-xl font-semibold text-gray-900 mb-2">Upload Your Bill</h3>
      <p className="text-base text-gray-500 mb-8">Take a photo or upload an image of your receipt</p>

      <label className="cursor-pointer">
        <input type="file" className="hidden" accept="image/*" onChange={onFileSelect} />
        <div className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition flex items-center gap-2 text-base">
          <Upload size={20} />
          Choose Image
        </div>
      </label>

      {selectedFile && (
        <p className="text-sm text-gray-500 mt-4">Selected: {selectedFile.name}</p>
      )}

      {/* 分隔线 */}
      <div className="flex items-center gap-3 w-full max-w-xs mt-8 mb-6">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-sm text-gray-400">or enter manually</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {/* 手动输入总价 */}
      <div className="w-full max-w-xs">
        <label className="block text-sm font-medium text-gray-700 mb-2 text-left">
          Total Amount
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={manualTotal || ''}
            onChange={(e) => onManualTotalChange(e.target.value)}
            className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-lg font-semibold"
          />
        </div>
        <p className="text-xs text-gray-400 mt-1 text-left">Used if OCR cannot detect the total</p>
      </div>
    </div>
  </div>
);

export default UploadArea;