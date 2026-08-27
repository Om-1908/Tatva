import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

const NotFoundPage = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="min-h-screen flex flex-col items-center justify-center px-margin-mobile text-center"
    >
      <div className="max-w-md space-y-6">
        <div className="text-[120px] font-headline-lg font-bold text-primary-container/20 leading-none">
          404
        </div>
        <h1 className="font-headline-md text-headline-md text-on-surface">
          Quantum State Not Found
        </h1>
        <p className="font-body-md text-on-surface-variant">
          The page you&apos;re looking for has collapsed into an unobservable state.
          Perhaps it exists in a parallel universe.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-8 py-3 rounded bg-primary-container text-white font-label-sm text-label-sm uppercase tracking-widest hover:shadow-[0_0_20px_rgba(79,70,229,0.4)] transition-all border-t border-white/20"
        >
          <span className="material-symbols-outlined text-[18px]">home</span>
          Return Home
        </Link>
      </div>
    </motion.div>
  )
}

export default NotFoundPage
