# The Tensor Lab

## Overview
The Tensor Lab is a ten-week summer research fellowship for machine learning engineers. It pairs talented ML engineers with medical students and practicing physicians at UCSF and UMSOM to tackle real clinical problems and lead focused research. 

- **Structure**: ML fellows act as technical leads alongside a medical student (who frames the research question and provides clinical context) under the supervision of a faculty physician advisor (who secures data access and sets scientific standards).
- **Logistics**: The fellowship is unpaid and remote, requiring 10-15 hours per week from June through August.
- **Outcome**: Successful projects lead to presentation at a national symposium, academic publication, and a reference letter from the faculty physician advisor. All code defaults to open science.

## Timeline (Summer 2026)
- **April 27 – May 26**: ML Students Apply. Candidates browse projects and apply. Medical students interview and select fellows on a rolling basis.
- **May 26 – June 16**: Institutional Onboarding. Securing credentials and access to necessary tools/data.
- **June 16 – August 25**: 10-Week Research Sprint. Building models, running experiments, analyzing results, and writing the paper.
- **End of Summer**: National Symposium. Teams present their final work and research findings.
- **Fall and Beyond**: Continued support for academic communication, including conferences and peer-reviewed publications.

## Our Team

### National Leadership
- **Matt Allen**: Executive Director, Co-Founder (UCSF)
- **Aaron Ge**: Technical Director, Co-Founder (UMSOM)
- **Chy Murali**: Operations Director (UMSOM)

### Chapter Leadership
**University of California, San Francisco (UCSF):**
- Nathan Robbins (Executive Director)
- Elisa Danthinne (Technical Director)
- Enrique Vazquez (Operations Director)

**University of Maryland School of Medicine (UMSOM):**
- Aarushi Negi (Executive Director)
- Skylar Chan (Technical Director)
- Dariush Aligholizadeh (Operations - Logistics)
- Eric Kim (Operations - Curriculum)
- Safi Rifai (Research Director)

### Faculty Physician Advisors
**UCSF:**
- Dr. Stefano Bini, MD (Orthopedic Surgery)
- Dr. Jonathan Carter, MD (General Surgery)
- Dr. Michael Chow, MD (Head & Neck Surgery)
- Dr. Maggie Chung, MD (Radiology, Breast Imaging)
- Dr. Pierre Martin, MD (Neurology)
- Dr. Thomas Nelson, MD (Neuro-Oncology)
- Dr. Coleen Sabatini, MD, MPH (Orthopedic Surgery)
- Dr. Madhumita Sushil, PhD (Clinical Informatics & Digital Transformation)
- Dr. Leigh Ann O'Banion, MD (Surgery, Vascular Surgery)

**UMSOM:**
- Dr. Brittney Williams, MD (Cardiothoracic Anesthesiology)
- Dr. Prajwal Ciryam, MD, PhD (Neurocritical Care)
- Dr. Minhaj Siddiqui, MD (Urologic Oncology)
- Dr. Alexandria Ratzki-Leewing, PhD (Epidemiology, Diabetes)
- Dr. Sui Seng Tee, PhD (Radiology, Nuclear Medicine)

---

## 2026 Project Catalogue

### 1. LLM Driven Patient Simulation for Enhancing Emergency Department Triage Training
- **Specialty**: Emergency Medicine, Medical Education
- **Institution**: UMSOM 
- **Lead / PI**: Aaron Ge / TBC
- **Clinical Problem**: Trainees often undertriage patients. Current training tools rely on scripted scenarios instead of realistic, conversational practice.
- **Technical Approach**: Use large language models grounded in MIMIC-IV ED and MIETIC data to generate interactive triage encounters, evaluate trainee decisions, and deliver immediate feedback.
- **Deliverable**: Web-based triage training simulator with LLM-driven patient chat.

### 2. Hormonal and Metabolic Risk Profiling for Greater Trochanteric Pain Syndrome
- **Specialty**: Orthopedic Surgery, Women's Health
- **Institution**: UCSF
- **Lead / PI**: Nathan Robbins / Dr. Stefano Bini
- **Clinical Problem**: Unreliable methods to identify postmenopausal women at highest risk for Greater Trochanteric Pain Syndrome and gluteus medius tendinopathy.
- **Technical Approach**: Predictive modeling and interpretable ML (e.g., SHAP) on the UCSF Information Commons dataset to build risk stratification profiles based on hormonal, metabolic, and reproductive factors.

### 3. Whole Genome Tokenization and Transformer Based Survival Modeling for Multi Ancestry Cardiac Risk Prediction
- **Specialty**: Cardiology, Genomics
- **Institution**: UMSOM (Institute for Health Computing)
- **Lead / PI**: Aaron Ge / Dr. Bradley Maron
- **Clinical Problem**: Current polygenic risk scores miss rare variants and perform poorly in non-European ancestries, leaving high-risk patients undetected.
- **Technical Approach**: Build a novel whole-genome tokenizer (VDKM) using Chaos Game Representation, then train a transformer-based survival model to predict 10-year MACE risk using the All of Us whole-genome cohort.

### 4. Orthopedic Outcome Disparities in American Indian and Alaska Native Patients
- **Specialty**: Orthopedic Surgery, Health Equity
- **Institution**: UCSF
- **Lead / PI**: Jacqueline Wright / Dr. Coleen Sabatini
- **Clinical Problem**: AI/AN patients experience worse orthopedic outcomes. The specific factors driving this disparity are unknown.
- **Technical Approach**: Supervised ML (XGBoost, logistic regression) on the UC Orthopaedic dataset, paired with SHAP and subgroup fairness analysis to identify predictors and evaluate unexplained gaps.

### 5. Causal Inference of Psychiatric Disorders on Hypoglycemia Risk in Type 2 Diabetes
- **Specialty**: Endocrinology, Psychiatry
- **Institution**: UMSOM
- **Lead / PI**: Komal Gandhi / Dr. Alexandria Ratzki-Leewing
- **Clinical Problem**: Unclear how psychiatric disorders (depression, anxiety, bipolar, schizophrenia) causally affect real-world hypoglycemia burden in Type 2 Diabetes patients.
- **Technical Approach**: Apply Targeted Maximum Likelihood Estimation (TMLE) and causal forests to retrospective EHR data to estimate the causal effect of mental health status and severity on 12-month hypoglycemia outcomes.

### 6. LLM Based Cancer Detection Method Classification from Radiology Reports
- **Specialty**: Radiology, Breast Oncology
- **Institution**: UCSF
- **Lead / PI**: Alyssa Sales / Dr. Maggie Chung
- **Clinical Problem**: Breast cancer detection method (screening vs. diagnostic) lacks structured extraction from radiology reports, bottlenecking large-scale outcomes research.
- **Technical Approach**: Zero-shot inference and fine-tuning with LLMs on UCSF breast imaging reports to automate classification.

### 7. Learning and Predicting Facility Level Cancer Care Quality Using Multi Cancer Data
- **Specialty**: Oncology, Health Services Research, Surgical Oncology
- **Institution**: UMSOM
- **Lead / PI**: Peter Lukish / Dr. Minhaj Siddiqui
- **Clinical Problem**: Unclear if cancer programs that perform well on quality measures for one cancer also deliver high-quality care across others.
- **Technical Approach**: Implement reproducible R pipelines using the National Cancer Database to estimate reliability-adjusted facility-level adherence rates and fit hierarchical logistic regression and Cox models.

### 8. 3D CT Segmentation of Paraesophageal Hernias
- **Specialty**: General Surgery, Radiology
- **Institution**: UCSF
- **Lead / PI**: Kate Solpari / Dr. Jonathan Carter
- **Clinical Problem**: Paraesophageal hernia volume predicts surgical risk but requires manual CT segmentation, limiting large-scale research.
- **Technical Approach**: Train a 3D semantic segmentation model (nnU-Net via PyTorch/MONAI) on preoperative CT scans to automatically measure hernia sac volume.

### 9. Augmented Pseudotime Analysis of Single Cell RNA Sequencing Data to Forecast Trajectories in Traumatic Brain Injury
- **Specialty**: Neurology, Neuroscience, TBI
- **Institution**: UMSOM
- **Lead / PI**: Milo Taylor / Dr. Prajwal Ciryam
- **Clinical Problem**: No current method to predict how a patient's brain cells will change after TBI based on an initial tissue snapshot.
- **Technical Approach**: Apply ML augmented pseudotime analysis on published single-cell RNA sequencing data to forecast cellular trajectories and biological states.

### 10. Interactive Clinical Reasoning Platform for Neurology Education
- **Specialty**: Neurology, Medical Education
- **Institution**: UCSF
- **Lead / PI**: Enrique Vazquez / Dr. Pierre Martin
- **Clinical Problem**: Trainees struggle to distinguish evolving neurologic diagnoses and apply quantitative reasoning (e.g., likelihood ratios) in practice.
- **Technical Approach**: Build a data-driven web platform rendering nonlinear neurologic disease trajectories using RAG, LLMs, and the UCSF neurology dataset for timeline-based practice.

### 11. Incidence, Risk Factors, and Therapeutic Outcomes of Post Cardiac Surgery Vasoplegia
- **Specialty**: Cardiac Surgery, Critical Care
- **Institution**: UMSOM
- **Lead / PI**: Makenzie Higgins / Dr. Brittney Williams
- **Clinical Problem**: Vasoplegia lacks a reliable prediction method and clear evidence on targeted therapies post-cardiac surgery.
- **Technical Approach**: Retrospective cohort analysis of adult cardiac surgery patients at UMMC (AI modeling component to be defined with the fellow).

### 12. EEG Based Brain Tumor Classification
- **Specialty**: Neurosurgery, Neuro-oncology
- **Institution**: UCSF
- **Lead / PI**: Esmé Wheeler / Dr. Thomas Nelson
- **Clinical Problem**: Brain tumor classification relies on postoperative pathology. Intraoperative EEG could offer immediate signal classification.
- **Technical Approach**: Analyze intraoperative brain surface electrode (EEG) recordings using time-series, graph neural networks, or multimodal fusion models to predict tumor characteristics.

### 13. Sex Differences in Adolescent Gray Matter Volume
- **Specialty**: Radiology, Neuroscience
- **Institution**: UMSOM
- **Lead / PI**: Akash Sureshkumar / Dr. Sui Seng Tee
- **Clinical Problem**: Most studies treat sex as a covariate rather than isolating its direct causal effect on gray matter volume from overall brain size during adolescence.
- **Technical Approach**: Apply causal ML methods (propensity score matching, causal forests) to the Queensland Twin Adolescent Brain dataset to estimate direct sex effects.

### 14. Perioperative Risk Prediction in Mandibular Reconstruction
- **Specialty**: Surgical Oncology, Head and Neck Surgery
- **Institution**: UCSF
- **Lead / PI**: Joshua Zhao / Dr. Michael Chow
- **Clinical Problem**: High morbidity/mortality risks in jaw reconstruction for oral cancer are hard to quantify preoperatively.
- **Technical Approach**: Ensemble ML models (XGBoost, SVM, MARS) on the National Cancer Database to predict perioperative risk.

### 15. Geospatial Machine Learning for Peripheral Arterial Disease Risk Mapping in California
- **Specialty**: Vascular Surgery, Population Health
- **Institution**: UCSF
- **Lead / PI**: Destin Hahuynh / Dr. Leigh O'Banion
- **Clinical Problem**: Peripheral Arterial Disease (PAD) is under-detected. Health systems need geographic risk stratification maps.
- **Technical Approach**: Build a tabular ML pipeline (XGBoost/LightGBM) on the CHAMPIONS health screening dataset to predict PAD risk and generate regional risk estimates across California.

### 16. Multimodal MRI Based Pipeline for Glioma Subtype Characterization and Demographic Bias Assessment
- **Specialty**: Neuro oncology, Radiology, Health Equity
- **Institution**: UCSF
- **Lead / PI**: Elisa Danthinne / Dr. Madhumita Sushil
- **Clinical Problem**: Molecular subtype of glioma informs prognosis and treatment, requiring invasive biopsy. MRI-based algorithms have limited generalizability and unexplored demographic bias.
- **Technical Approach**: Run multiple MRI-based or multimodal models to characterize baseline performance differences, then test and validate variations of training data and architectures.
