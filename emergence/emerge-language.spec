// EMERGE LANGUAGE SPEC v2.0.0
// A systems language for describing any system.
// No runtime. No framework. No domain.
// The spec is the language. The language is the constraint field.
// Edit this file → everything that reads it updates.

version 2.0.0

// ─────────────────────────────────────────────────────────────────────────────
// ROOT TYPES — the seven things any system can be made of
// ─────────────────────────────────────────────────────────────────────────────

root Structure    // the shape of a thing
root Signal       // a transition between states
root Observation  // a measurement of what is
root Gap          // the absence of expected structure
root Record       // truth written down
root Identity     // what makes a thing itself
root Lens         // a way of looking at any of the above

// ─────────────────────────────────────────────────────────────────────────────
// AXIOMS — always true, everywhere, for any system written in Emerge
// ─────────────────────────────────────────────────────────────────────────────

axiom NO_SILENT_DROP          // nothing disappears without a record
axiom SIGNAL_MUST_ROUTE       // every signal goes somewhere or is logged as noise
axiom GAP_IS_FIRST_CLASS      // absence is as real as presence
axiom EXECUTION_IS_TRACEABLE  // every step can be reconstructed
axiom RECORD_IS_TRUTH         // what was written is what happened
axiom GRAMMAR_APPLIES_TO_ITSELF // the language describes itself

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 1 — STRUCTURE
// The shape of any system: how it is bounded, connected, and controlled.
// ─────────────────────────────────────────────────────────────────────────────

domain "structure"

system      = a_bounded_executable_thing
core        = immutable_rules_of_a_system
invariant   = always_true_within_a_system
axiom       = invariant_that_applies_everywhere
maxim       = invariant_that_applies_under_conditions
constraint  = invariant_that_applies_locally
component   = a_named_transform_inside_a_system
compartment = a_bounded_container_of_components
seam        = the_boundary_between_two_components
edge        = a_defined_transition_point
gate        = a_control_point_that_decides_flow
framework   = a_component_that_wraps_another_system
substrate   = the_medium_through_which_signals_travel

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 2 — SIGNAL
// How things move: state, flow, feedback, loops.
// ─────────────────────────────────────────────────────────────────────────────

domain "signal"

signal      = an_expected_state_transition
state       = the_current_condition_of_a_system
input       = data_entering_a_component
output      = data_leaving_a_component
flow        = a_directed_path_a_signal_takes
feedback    = an_output_that_becomes_an_input
loop        = a_component_that_repeats
context     = the_conditions_surrounding_a_signal
source      = where_a_signal_originates
sink        = where_a_signal_terminates
channel     = a_persistent_path_between_two_points
pipe        = a_sequential_chain_of_transforms
broadcast   = a_signal_sent_to_all_listeners
route       = select_a_path_for_a_signal
emit        = produce_an_observable_signal
drop        = discard_a_signal_with_a_record

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 3 — OBSERVATION
// How we measure what is happening.
// ─────────────────────────────────────────────────────────────────────────────

domain "observation"

observer    = a_component_that_watches_without_changing
baseline    = the_established_expected_behavior
sigma       = divergence_from_baseline
delta       = the_distance_between_expected_and_actual
slope       = the_rate_of_change_of_delta
polarity    = the_direction_of_divergence
trend       = trajectory_over_time
drift       = directional_movement_away_from_baseline
identity    = the_stable_structural_signature_of_a_thing
divergence  = distance_between_a_thing_and_its_identity
gap         = expected_structure_that_is_absent
edge        = the_moment_a_value_crosses_a_threshold
fidelity    = how_complete_a_signal_is
health      = composite_signal_quality_over_time
noise       = a_signal_that_does_not_resolve
observation = the_result_of_applying_sigma_to_a_baseline

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 4 — FIELD PHYSICS
// The forces that act on structure over time.
// ─────────────────────────────────────────────────────────────────────────────

domain "field"

coherence   = ability_to_hold_structure_under_load
entropy     = the_natural_disorder_of_structure
friction    = conflicting_structures_resisting_each_other
pressure    = the_significance_of_missing_structure
density     = the_generative_potential_of_a_gap
tension     = accumulated_pressure_around_a_gap
stability   = coherence_over_entropy_ratio
resonance   = similarity_between_two_structures
alignment   = when_a_signal_matches_its_identity
regime      = the_current_behavioral_classification_of_a_system

regime.stable      = sigma_within_normal_bounds
regime.drifting    = sigma_moving_directionally
regime.diverged    = sigma_beyond_recovery_threshold
regime.oscillating = sigma_alternating_periodically
regime.collapsing  = coherence_approaching_zero

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 5 — GAP FIELD
// The taxonomy of what is missing.
// ─────────────────────────────────────────────────────────────────────────────

domain "gap"

gap.structural    = a_field_or_key_that_should_exist_but_does_not
gap.logical       = a_contradiction_in_the_structure_of_a_thing
gap.evidential    = a_claim_without_supporting_data
gap.temporal      = expected_sequence_that_did_not_arrive
gap.causal        = a_cause_without_a_traceable_effect
gap.contextual    = structure_missing_its_surrounding_conditions
gap.assumption    = an_implied_invariant_that_was_never_stated
gap.contradiction = two_true_things_that_cannot_coexist

uncertainty = a_gap_whose_shape_is_not_yet_known
omission    = expected_structure_that_was_not_provided
inference   = structure_implied_by_what_surrounds_a_gap
promotion   = a_gap_resolved_into_known_structure

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 6 — RECORD
// Authoritative history. The past is immutable.
// ─────────────────────────────────────────────────────────────────────────────

domain "record"

record      = an_authoritative_append_only_sequence
ledger      = a_named_record_with_schema
snapshot    = the_state_of_a_system_at_a_point_in_time
clip        = a_bounded_window_into_a_record
fork        = a_divergent_branch_of_a_record
lineage     = the_ancestry_of_a_record_entry
replay      = reconstruct_state_from_record
compress    = encode_a_record_for_storage
blueprint   = a_structural_digest_of_a_record
crystal     = a_record_entry_that_is_immutable_and_content_addressed
append      = write_one_entry_to_a_record
tail        = read_the_last_n_entries_of_a_record
schema      = the_declared_shape_of_a_record_entry

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 7 — IDENTITY
// What makes a thing itself, persistently.
// ─────────────────────────────────────────────────────────────────────────────

domain "identity"

id          = a_unique_stable_identifier
uuid        = a_universally_unique_identifier
fingerprint = a_structural_signature_of_a_thing_not_its_values
presence    = how_often_a_field_appears_in_a_stream
dominant    = the_most_frequent_structure_in_a_window
stable      = identity_confirmed_by_sufficient_presence
drift       = identity_moving_away_from_its_own_baseline
version     = a_named_point_in_an_identity_timeline

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 8 — LENS
// A way of looking. Lenses observe. They never gate.
// ─────────────────────────────────────────────────────────────────────────────

domain "lens"

lens        = an_observer_that_annotates_without_changing_flow
delta_lens  = measures_structural_divergence_from_ledger_history
sigma_lens  = compares_two_sources_for_drift
trend_lens  = measures_directional_movement_over_time
gap_lens    = detects_fields_missing_from_identity
edge_lens   = fires_when_a_value_crosses_a_threshold
custom_lens = any_user_defined_observer

// lens contract: every lens
//   receives  (data, meta)
//   annotates meta.lens.<name>
//   emits     a named event
//   returns   data unchanged — never null

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 9 — MEMORY
// How a system remembers. Four archetypes.
// ─────────────────────────────────────────────────────────────────────────────

domain "memory"

memory      = a_named_persistence_layer
ring        = fixed_size_circular_memory_overwrites_oldest
store       = keyed_document_memory_queryable_by_key
pattern     = fingerprint_sequence_memory_detects_cycles
crystal     = immutable_content_addressed_memory_high_quality_only

// memory tiers (by access frequency and mutability)
tier.hot    = active_in_process_memory
tier.warm   = recent_on_disk_memory
tier.cold   = archived_compressed_memory
tier.frozen = immutable_crystallized_memory

ingest      = write_to_memory
recall      = read_from_memory
forget      = soft_delete_from_memory
distill     = compress_many_memories_into_one_crystal

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 10 — TIME
// Sequence, duration, position.
// ─────────────────────────────────────────────────────────────────────────────

domain "time"

timestamp   = a_point_in_time
interval    = a_duration_between_two_points
window      = a_bounded_slice_of_time
sequence    = an_ordered_series_of_events
tick        = a_monotonic_counter_increment
recency     = how_fresh_a_signal_is
decay       = loss_of_relevance_over_time
expiry      = the_point_at_which_a_thing_is_no_longer_valid

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 11 — FLOW CONTROL
// Decisions. Branches. Conditions.
// ─────────────────────────────────────────────────────────────────────────────

domain "flow"

if          = evaluate_a_condition
then        = the_path_taken_when_condition_is_true
else        = the_path_taken_when_condition_is_false
when        = a_conditional_event_handler
unless      = if_not
try         = attempt_execution_catch_failure
catch       = handle_failure_without_halt
finally     = always_execute_regardless_of_result
halt        = stop_execution_with_a_record
whatif      = speculative_branch_that_does_not_commit
branch      = a_named_divergent_execution_path
merge       = join_two_branches_back_together

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 12 — PERSISTENCE
// Write. Read. Forget. Archive.
// ─────────────────────────────────────────────────────────────────────────────

domain "persistence"

persist     = write_to_durable_storage
restore     = read_from_durable_storage
archive     = move_to_long_term_storage
purge       = delete_with_a_record
migrate     = transform_stored_structure_to_new_schema
validate    = check_a_value_against_a_schema
dedup       = reject_if_already_stored

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 13 — EVENTS
// Observable moments. The bus is the nervous system.
// ─────────────────────────────────────────────────────────────────────────────

domain "events"

bus         = a_shared_event_spine_all_components_use
event       = a_named_observable_moment
handler     = a_component_that_responds_to_an_event
on          = declare_a_handler_for_an_event
before      = a_hook_that_runs_before_an_event
after       = a_hook_that_runs_after_an_event
publish     = emit_an_event_to_the_bus
subscribe   = register_to_receive_an_event
unsubscribe = remove_a_handler_from_an_event
once        = handle_an_event_exactly_once

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 14 — TYPE SYSTEM
// The primitives that fields can be.
// ─────────────────────────────────────────────────────────────────────────────

domain "types"

string      = text
int         = whole_number
float       = decimal_number
bool        = true_or_false
timestamp   = point_in_time
list        = ordered_collection_of_values
map         = keyed_collection_of_values
any         = unconstrained_value
null        = the_explicit_absence_of_a_value
hash        = cryptographic_content_digest
semver      = semantic_version_string
score       = a_weighted_composite_numeric_value
ring        = a_bounded_circular_buffer_of_values
required    = this_field_must_be_present
optional    = this_field_may_be_absent

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 15 — NETWORK
// Any connection between any two things.
// ─────────────────────────────────────────────────────────────────────────────

domain "network"

connection  = a_persistent_link_between_two_endpoints
endpoint    = a_named_address_that_accepts_signals
protocol    = the_rules_of_a_connection
port        = a_numeric_address_on_a_host
bind        = attach_to_an_address
connect     = establish_a_connection
disconnect  = terminate_a_connection
reconnect   = re_establish_after_failure
handshake   = the_establishment_sequence_of_a_connection
heartbeat   = a_periodic_liveness_signal
ping        = a_health_check_signal
pong        = a_health_check_response
open        = a_connection_is_ready
close       = a_connection_has_ended
channel     = a_named_persistent_connection
broadcast   = send_to_all_connected_endpoints
register    = announce_presence_to_a_network

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 16 — RENDER
// Any visual surface. Panel, layout, widget.
// ─────────────────────────────────────────────────────────────────────────────

domain "render"

surface     = a_visual_output_target
panel       = a_bounded_visual_region
layout      = the_spatial_arrangement_of_panels
widget      = a_named_reusable_visual_component
theme       = a_declared_visual_style
tab         = a_named_selectable_panel
split       = a_panel_divided_into_regions
modal       = a_blocking_overlay_panel
toast       = a_non_blocking_notification
tooltip     = a_contextual_hover_display
statusbar   = a_persistent_information_strip
scroll      = viewport_position_signal
focus       = the_active_panel
blur        = a_panel_losing_focus
resize      = a_boundary_adjustment_signal
render      = produce_visual_output_from_state
hotswap     = replace_a_component_without_stopping

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 17 — EDITOR
// Text, tokens, navigation. For any editor surface.
// ─────────────────────────────────────────────────────────────────────────────

domain "editor"

buffer      = mutable_text_content
line        = a_single_row_of_text
token       = a_lexed_unit_of_text
span        = a_styled_range_of_tokens
decoration  = a_non_printing_overlay
marker      = a_position_annotation
diagnostic  = an_error_or_gap_annotation
fold        = a_collapsed_region_of_text
cursor      = the_current_position_in_a_buffer
selection   = a_bounded_cursor_range
autocomplete = a_completion_suggestion
hover       = contextual_information_on_a_token
goto        = navigate_to_a_position
find        = search_for_text
replace     = mutate_matched_text
undo        = revert_to_prior_state
redo        = advance_to_reverted_state
format      = normalise_source_text
syntax      = token_coloring_rules

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 18 — STREAMING
// Continuous data. Backpressure. Windows.
// ─────────────────────────────────────────────────────────────────────────────

domain "streaming"

stream      = a_continuous_signal_channel
buffer      = in_flight_data_accumulator
flush       = emit_all_buffered_data
drain       = consume_until_empty
backpressure = flow_control_when_consumer_is_slow
watermark   = a_position_marker_in_a_stream
window      = a_bounded_slice_of_a_stream
throttle    = rate_limited_stream
debounce    = delayed_stream_emit
chunk       = a_single_unit_of_a_stream

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 19 — AI / INFERENCE
// Models, prompts, responses. Any inference runtime.
// ─────────────────────────────────────────────────────────────────────────────

domain "inference"

model       = a_declared_inference_capability
catalog     = an_ordered_registry_of_models
fitness     = a_model_capability_score_per_task
task        = a_declared_inference_task_type
prompt      = input_to_an_inference_model
response    = output_from_an_inference_model
token       = the_atomic_unit_of_inference_output
stream      = continuous_inference_token_output
thinking    = a_reasoning_trace_before_response
temperature = sampling_randomness_parameter
max_tokens  = maximum_output_length
stop        = a_generation_termination_signal
context     = the_assembled_input_for_inference
suggest     = a_single_inference_suggestion
accept      = a_suggestion_was_used
reject      = a_suggestion_was_discarded
explain     = inference_producing_an_explanation
generate    = inference_producing_new_content
review      = inference_evaluating_existing_content

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 20 — VOICE
// Audio in, audio out. Any voice surface.
// ─────────────────────────────────────────────────────────────────────────────

domain "voice"

microphone  = an_audio_capture_device
speaker     = an_audio_output_device
transcribe  = convert_audio_to_text
synthesize  = convert_text_to_audio
utterance   = a_complete_spoken_unit
phrase      = a_partial_spoken_unit
silence     = an_audio_gap_signal
wakeword    = an_activation_phrase
interim     = a_partial_transcription
final       = a_complete_transcription
speak       = emit_audio_output
listen      = receive_audio_input
mute        = disable_audio_input
unmute      = enable_audio_input
volume      = audio_level
pitch       = audio_frequency_parameter
rate        = speech_speed_parameter

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 21 — VERSION CONTROL
// History, branches, commits. For any artifact.
// ─────────────────────────────────────────────────────────────────────────────

domain "version"

commit      = a_content_addressed_snapshot
branch      = a_named_pointer_to_a_commit_chain
fork        = create_a_divergent_version_chain
merge       = join_two_branches
rollback    = restore_to_a_prior_commit
diff        = the_difference_between_two_versions
tag         = a_named_label_on_a_commit
changelog   = human_readable_version_notes
lineage     = the_ancestry_of_a_commit
rewind      = restore_state_from_a_prior_record

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 22 — PIPELINE
// Ordered execution graphs. Nodes, triggers, branches.
// ─────────────────────────────────────────────────────────────────────────────

domain "pipeline"

pipeline    = an_ordered_executable_node_graph
node        = a_single_execution_unit_in_a_pipeline
trigger     = a_node_that_starts_a_pipeline
condition   = a_node_that_branches_on_a_predicate
transform   = a_node_that_mutates_data
call        = a_node_that_invokes_another_component
store       = a_node_that_writes_to_memory
emit        = a_node_that_publishes_an_event
loop        = a_node_that_iterates_a_collection
delay       = a_node_that_waits_a_duration
fork        = a_node_that_starts_parallel_branches
merge       = a_node_that_joins_parallel_branches
notify      = a_node_that_sends_a_notification
arm         = enable_a_pipeline_scheduler
disarm      = disable_a_pipeline_scheduler

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 23 — FIELD SYNTAX
// Common field names. Use in any component or record declaration.
// ─────────────────────────────────────────────────────────────────────────────

domain "fields"

id          = component_identity_field
uuid        = universally_unique_identity_field
version     = semantic_version_field
name        = human_readable_name_field
description = human_readable_description_field
intent      = declared_purpose_field
source      = origin_reference_field
target      = destination_reference_field
path        = filesystem_or_signal_path_field
mode        = operational_mode_field
interval    = timing_period_field
priority    = execution_priority_field
reason      = explanation_field
note        = annotation_field
severity    = criticality_level_field
status      = current_state_field
enabled     = is_active_flag
ready       = is_ready_flag
alive       = is_alive_flag
running     = is_executing_flag
ts          = timestamp_field
score       = quality_score_field

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 24 — PLUGIN
// Any component dropped in at runtime without restart.
// ─────────────────────────────────────────────────────────────────────────────

domain "plugin"

plugin      = a_named_transform_loaded_at_runtime
priority    = execution_order_in_the_pipe
enabled     = is_this_plugin_currently_active
config      = mutable_runtime_configuration
process     = the_transform_function_of_a_plugin
stats       = observable_metrics_of_a_plugin
register    = add_a_plugin_to_the_registry
enable      = activate_a_plugin
disable     = deactivate_a_plugin
hot_reload  = replace_a_plugin_without_restart

// plugin contract:
//   process(data, meta, config) → data | null
//   null = drop with record
//   throw = surface error, pipe continues
//   never silent

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 25 — UI CONTRACT
// How a component declares its interface to any surface.
// ─────────────────────────────────────────────────────────────────────────────

domain "contract"

contract    = the_declared_interface_of_a_component
panel       = which_visual_region_this_component_belongs_to
widget      = which_widget_type_to_mount
action      = a_command_this_component_exposes_to_the_surface
control     = an_interactive_element_bound_to_a_config_or_command
display     = a_mapping_of_labels_to_observable_values
emits       = events_this_component_produces
hotswap     = replace_this_component_live

// control types:
//   slider  → bound to a numeric config or invariant key
//   toggle  → bound to a boolean config or command
//   input   → bound to a string or JSON config or invariant key
//   select  → bound to an enum config or invariant key
//   button  → sends a command when clicked

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 26 — AXIOM SYSTEM
// Hard constraints on what can flow through a system.
// ─────────────────────────────────────────────────────────────────────────────

domain "constraints"

axiom       = a_rule_that_cannot_be_violated
rule        = a_predicate_over_data_and_meta
violation   = the_named_reason_a_rule_failed
register    = add_an_axiom_to_the_constraint_engine
evaluate    = test_all_axioms_against_a_signal
pass        = a_signal_satisfied_all_axioms
drop        = a_signal_that_violated_an_axiom

// axiom contract:
//   rule(data, meta) → bool
//   true  = passes
//   false = violation, hard drop, record written
//   axioms run before everything else
//   axioms cannot be disabled at runtime

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 27 — SPECULATION
// Branches that explore without committing.
// ─────────────────────────────────────────────────────────────────────────────

domain "speculation"

idea        = a_speculative_unit_not_yet_validated
tension     = accumulated_pressure_on_an_unresolved_idea
phase       = the_lifecycle_stage_of_an_idea
promote     = advance_an_idea_to_a_validated_record
proof       = the_evidence_required_for_promotion
bottleneck  = unresolved_speculative_load_in_the_system
conversion  = ratio_of_ideas_that_reach_promotion

phase.seed        = idea_first_proposed
phase.expanding   = idea_being_elaborated
phase.tensioned   = idea_under_pressure_from_gaps
phase.specced     = idea_has_a_declared_structure
phase.building    = idea_being_implemented
phase.promoted    = idea_validated_and_recorded

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 28 — LIVENESS
// Health, heartbeat, watchdog. For any running component.
// ─────────────────────────────────────────────────────────────────────────────

domain "liveness"

heartbeat   = a_periodic_signal_proving_a_component_is_alive
pulse       = a_single_heartbeat_emission
watchdog    = a_component_that_detects_absence_of_heartbeat
bpm         = beats_per_minute_of_a_heartbeat
latency     = time_between_a_signal_and_its_response
score       = composite_liveness_quality
degraded    = a_component_missing_expected_beats
dead        = a_component_that_has_stopped_responding
recover     = a_component_returning_to_liveness
register    = add_a_component_to_liveness_monitoring
unregister  = remove_a_component_from_liveness_monitoring

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 29 — COMPILER / LANGUAGE
// How Emerge describes itself and is processed.
// ─────────────────────────────────────────────────────────────────────────────

domain "compiler"

spec        = a_file_that_defines_a_system_in_emerge
domain      = a_named_vocabulary_group_within_a_spec
primitive   = a_single_word_with_a_declared_meaning
root        = a_top_level_type_in_a_spec
pass        = a_single_compiler_transformation_step
tokenise    = split_source_into_primitive_units
classify    = assign_domain_and_type_to_each_token
resolve     = find_the_meaning_of_each_primitive
emit        = produce_output_from_compiled_source
validate    = check_source_against_all_constraints
gap         = a_primitive_used_but_not_declared
bridge      = a_non_adjacent_type_resolution
violation   = a_constraint_broken_by_source

// compiler passes:
//   pass0 = tokenise and classify
//   pass1 = build constraint field
//   pass2 = resolve gaps and bridges
//   pass3 = emit target output

// ─────────────────────────────────────────────────────────────────────────────
// LANGUAGE RULES — how to write in Emerge
// ─────────────────────────────────────────────────────────────────────────────

// DECLARATION FORMS:
//   name = meaning                     define a primitive
//   name : type                        declare a typed field
//   domain "name"                      open a vocabulary group
//   root Type                          declare a top-level type
//   axiom NAME                         declare an invariant
//   system Name { ... }                declare a system
//   component Name { ... }             declare a component
//   compartment Name { ... }           declare a bounded container
//   seam Name { from → to }           declare a boundary
//   gate Name { condition → result }   declare a control point
//   lens Name { observes field }       declare an observer
//   record Name { field : type }       declare a schema
//   catalog Name { entry ... }         declare a registry
//   on event { handler }               declare an event handler
//   emit event { payload }             declare an emission

// FIELD SYNTAX:
//   field = value                      assign a meaning
//   field : type                       type-annotate a field
//   field : required type              require this field
//   field : optional type              allow this field to be absent
//   field : type = default             type with default value

// COMMENT FORMS:
//   // single line comment
//   /* block comment */
//   // ── section header ─────

// SCORE VECTORS:
//   scores { axis: float ... }         declare a multi-axis score
//   fitness = composite_score          single composite

// VERSION:
//   version semver                     declare spec version

// ─────────────────────────────────────────────────────────────────────────────
// META — this spec describes itself
// ─────────────────────────────────────────────────────────────────────────────

system EMERGE {
  version  : semver   = 2.0.0
  intent   : string   = a_language_for_describing_any_system
  axioms   : list     = [NO_SILENT_DROP, SIGNAL_MUST_ROUTE, GAP_IS_FIRST_CLASS,
                         EXECUTION_IS_TRACEABLE, RECORD_IS_TRUTH,
                         GRAMMAR_APPLIES_TO_ITSELF]
  roots    : list     = [Structure, Signal, Observation, Gap, Record, Identity, Lens]
  domains  : int      = 29
  targets  : list     = [any_system, any_language, any_runtime, any_medium]
}
