import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { subDays } from 'date-fns';

interface Props {
  startDate: Date;
  endDate: Date;
  onChange: (dates: [Date, Date]) => void;
}

export default function DatePickerRange({ startDate, endDate, onChange }: Props) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <DatePicker
        selected={startDate}
        onChange={(date) => date && onChange([date, endDate])}
        showTimeSelect
        timeFormat="HH:mm"
        timeIntervals={15}
        dateFormat="yyyy-MM-dd HH:mm"
        className="px-3 py-1 border rounded w-48 text-sm"
      />
      <span>to</span>
      <DatePicker
        selected={endDate}
        onChange={(date) => date && onChange([startDate, date])}
        showTimeSelect
        timeFormat="HH:mm"
        timeIntervals={15}
        dateFormat="yyyy-MM-dd HH:mm"
        className="px-3 py-1 border rounded w-48 text-sm"
      />
    </div>
  );
}