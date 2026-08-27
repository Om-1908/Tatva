import React from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'

// Register Chart.js modules
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

export default function ProbabilityChart({ probabilities, statevector, counts, qubits = 4, tabMode = 'probabilities' }) {
  const n = Math.max(1, qubits || 4)
  const totalStates = 1 << n

  const labels = []
  const dataValues = []

  for (let i = 0; i < totalStates; i++) {
    const bitstring = i.toString(2).padStart(n, '0')
    labels.push(bitstring)

    if (tabMode === 'probabilities') {
      const prob = probabilities?.[bitstring] ?? 0
      dataValues.push(Number((prob * 100).toFixed(1)))
    } else if (tabMode === 'statevector') {
      const amp = statevector?.[i] || { real: 0, imag: 0 }
      const real = amp?.real ?? (typeof amp === 'number' ? amp : 0)
      const imag = amp?.imag ?? 0
      const mag = Math.sqrt(real * real + imag * imag)
      dataValues.push(Number(mag.toFixed(4)))
    } else if (tabMode === 'counts') {
      const count = counts?.[bitstring] ?? 0
      dataValues.push(count)
    }
  }

  const isProb = tabMode === 'probabilities'
  const isSV = tabMode === 'statevector'
  const barColor = isProb ? '#00a6ff' : isSV ? '#3b82f6' : '#8a3ffc'

  const data = {
    labels,
    datasets: [
      {
        label: isProb ? 'Probability (%)' : isSV ? 'Amplitude' : 'Shot Counts',
        data: dataValues,
        backgroundColor: barColor,
        borderColor: barColor,
        borderWidth: 0,
        borderRadius: 0,
        barPercentage: totalStates > 8 ? 0.6 : 0.4,
        categoryPercentage: 0.8,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#262c35',
        titleColor: '#ffffff',
        bodyColor: '#e1e4e8',
        borderColor: '#30363d',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 6,
        displayColors: true,
        boxWidth: 8,
        boxHeight: 8,
        boxPadding: 4,
        usePointStyle: true,
        callbacks: {
          title: (items) => `State ${items[0]?.label || ''}`,
          label: (item) =>
            ` ${
              isProb
                ? `Probability: ${item.raw}%`
                : isSV
                ? `Amplitude: ${item.raw}`
                : `Shots: ${item.raw}`
            }`,
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
          drawBorder: true,
          borderColor: '#30363d',
        },
        ticks: {
          color: '#8b949e',
          font: { family: 'monospace', size: 10 },
          maxRotation: 45,
          minRotation: 45,
        },
        title: {
          display: true,
          text: 'Computational basis states',
          color: '#8b949e',
          font: { family: 'sans-serif', size: 11, weight: '500' },
          padding: { top: 8, bottom: 0 },
        },
      },
      y: {
        min: 0,
        max: isProb ? 100 : isSV ? 1.0 : undefined,
        grid: {
          color: 'rgba(255, 255, 255, 0.07)',
          borderColor: '#30363d',
        },
        ticks: {
          color: '#8b949e',
          font: { family: 'monospace', size: 10 },
          stepSize: isProb ? 20 : isSV ? 0.2 : undefined,
        },
        title: {
          display: true,
          text: isProb ? 'Probability (%)' : isSV ? 'Amplitude' : 'Shot Counts',
          color: '#8b949e',
          font: { family: 'sans-serif', size: 11, weight: '500' },
        },
      },
    },
  }

  return (
    <div className="w-full h-full relative p-2 select-none">
      <Bar data={data} options={options} />
    </div>
  )
}
