// Reviewed booking-opening and queue-admission optimizations. Behavioral and
// failure coverage is in run_booking_speed_checks; receipt/pruning/send safety
// remains covered by run_property_policy_checks and the existing queue suites.
module.exports = {
  changed: ['beginRequestMetrics_','finishRequestMetrics_','doGet','createBookingBatch_','finishPreparedBooking_','queueSecondaryTask_'],
  added: ['finishPreparedBookings_','queueSecondaryTasks_']
};
