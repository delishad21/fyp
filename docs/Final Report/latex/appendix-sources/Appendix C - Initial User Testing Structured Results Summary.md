# Appendix C - Initial User Testing Structured Results Summary

## 1. Dataset Overview

- Raw usable rows in cleaned CSV export: **11**
- Marked as finished in CSV: **9**
- Marked as partial in CSV: **2**

## 2. Method Summary

This user testing phase mainly wanted to investigate the usability and learnability of key teacher workflows. These included the teacher dashboard functionalities of class, quiz and schedule management. The AI and gamification features were deliberately exluded in this phase, as it the main goal of this test was to gather insights on the foundational workflows before introducting the more novel features. This evaluation also wanted to find out the perceived value of the platform for teachers, as in, how well would the platform translate into real classroom use, and how likely teachers would pick up this platform in practice. To further prepare for the implementation of AI features, this evaluation also wanted to explore teachers' attitudes toward the use of AI for quiz generation, and what conditions would make them feel comfortable using such features in practice.

The main objectives of this evaluation were as follows:

1. Determining learnability and usability levels in relation to core teacher workflows,
2. Evaluating the clarity of quiz types and scheduling interfaces,
3. Measuring practical value and relevance of the platform for teachers, and
4. Exploring attitudes toward AI quiz generation.

The survey was hosted on Qualtrics as it provided the flexibility to design a structured survey with complex survey flow and question types, while also allowing for the collection and visualisation of data.

The prototype platform was self-hosted and multiple teacher accounts were created beforehand to provide a smoother onboarding experience, as participants were not required to go through a tedious registration process.

Credentials were issued using a self-developed atomic credential issuer tool, which was linked to the Qualtrics survey flow. This allowed each participant to receive unique credentials for the prototype platform immediately after consenting to participate in the survey, which they could then use to log in and complete the assigned tasks on the platform.

The full survey content is provided in **Appendix B (Initial User Testing Survey Instrument)**, and the main sections of the survey were structured as scenarios. Participants were guided through four scenarios that represented common teacher-based user journeys. Each scenario had a set of associated tasks that participants were asked to complete, but step-by-step instructions were intentionally hidden to allow for a more natural first-time interaction with the platform. This allows for a better assessment of the discoverability and learnability of the platform, as well as the intuitiveness of the user interface and workflows.

The four scenarios are as follows:

1. **Scenario 1: Class Creation and Student Management** - This scenario focused on the process of creating a new class, adding students to the class, and managing student information.
2. **Scenario 2: Quiz Creation and Management** - This scenario focused on the process of creating quizzes, adding questions to the quiz, and managing quiz content. Tasks included creating a quiz, adding different types of questions (e.g. multiple choice, short answer), and editing quiz content. The sample quiz content that were provided to the teachers were designed to be relevant to the subjects and year groups that the teachers selected at the start of the survey, in order to make the tasks more realistic for the participants.
3. **Scenario 3: Scheduling Quizzes** - This scenario focused on the process of scheduling quizzes for students, including attempt windows, attempt limits and rescheduling flows.
4. **Scenario 4: Student Quiz Experience** - This scenario focused on the student experience of attempting a quiz and reviewing their results. No actual hands on tasks were assigned here. Teachers were just given a video walkthrough of the student quiz experience and were asked to evaluate the design and usability of the student-facing mobile application based on their observations. Gamification features were intentionally excluded from this scenario, as the main focus was on the core quiz-taking experience and the mobile interface, and not the additional engagement features.

After each scenario, participants were given a set of Likert-scale questions to evaluate the the platform for the tasks they had just completed. These were followed by open-ended questions to gather qualitative feedback and identify specific pain points, areas of confusion, and suggestions for improvement.

Following the four scenario-based tasks, the survey included two additional sections:

1. Perceived value of the platform for teachers, and
2. Attitudes toward AI generation features for quizzes.

## 3. Participant Background

### 3.1 Teaching Experience

- 10+: 6
- 3-5: 3
- 6-10: 2

![Teaching experience distribution](figures/generated-figures/annex-g-teaching-experience.svg)

_Figure C.1. Distribution of teaching experience across the cleaned response set._

### 3.2 Frequency of Creating Revision Materials

- Weekly: 8
- Monthly: 2
- Rarely: 1

### 3.3 Subjects Taught

- Math: 7
- English: 4
- Science: 3
- Mother Tongue: 1
- PHE: 1

Some respondents selected more than one teaching subject, so these counts are not mutually exclusive.

![Subject distribution](figures/generated-figures/annex-g-subjects.svg)

_Figure C.2. Subject distribution across respondents. Counts are not mutually exclusive._

## 4. Quantitative Results by Survey Block

![Mean ratings by survey block](figures/generated-figures/annex-g-block-means.svg)

_Figure C.3. Aggregate mean score across each survey block, based on the cleaned CSV responses._

### 4.1 Class Creation

- Respondents with data in this block: **11**
- Aggregate mean across block: **4.95 / 5.00**

| Item                                                                                                                                                  |   n | Mean | Strongly agree | Agree / Somewhat agree | Neither / Disagree |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | --: | ---: | -------------: | ---------------------: | -----------------: |
| The process of creating and managing a class was easy to understand.                                                                                  |  11 | 4.82 |              9 |                      2 |                  0 |
| The class setup process was guided clearly by the interface.                                                                                          |  11 | 5.00 |             11 |                      0 |                  0 |
| The terminology used was familiar and appropriate for a school setting.                                                                               |  11 | 5.00 |             11 |                      0 |                  0 |
| Importing student information when creating a class was a straightforward process.                                                                    |  11 | 5.00 |             11 |                      0 |                  0 |
| The student account creation process, where usernames and passwords are shown to the teacher for dissemination, felt suitable for real classroom use. |  11 | 4.91 |             10 |                      1 |                  0 |

![Class creation item means](figures/generated-figures/annex-g-class-creation-items.svg)

_Figure C.4. Mean scores for the individual class-creation items in the initial user test._

### 4.2 Quiz Creation

- Respondents with data in this block: **10**
- Aggregate mean across block: **4.70 / 5.00**

| Item                                                                                         |   n | Mean | Strongly agree | Agree / Somewhat agree | Neither / Disagree |
| -------------------------------------------------------------------------------------------- | --: | ---: | -------------: | ---------------------: | -----------------: |
| The process of creating a quiz was easy to understand on first use.                          |  10 | 4.60 |              6 |                      4 |                  0 |
| The interface guided the quiz creation process in an intuitive manner.                       |  10 | 4.60 |              6 |                      4 |                  0 |
| The interface guided me naturally through quiz creation.                                     |  10 | 4.60 |              6 |                      4 |                  0 |
| The differences between Basic and Crossword quizzes were easy to understand during creation. |  10 | 4.90 |              9 |                      1 |                  0 |
| The system provided the right amount of configuration options for quiz creation.             |  10 | 4.70 |              7 |                      3 |                  0 |
| Each quiz type (basic, crossword, rapid) was perceived to be clear and distinct.             |  10 | 4.90 |              9 |                      1 |                  0 |
| The available quiz types were aligned with common classroom revision practices.              |  10 | 4.70 |              7 |                      3 |                  0 |
| The available quiz types were sufficient for supporting typical revision needs.              |  10 | 4.60 |              7 |                      2 |                  1 |

![Quiz creation item means](figures/generated-figures/annex-g-quiz-creation-items.svg)

_Figure C.5. Mean scores for the individual quiz-creation items in the initial user test._

### 4.3 Scheduling and Rescheduling

- Respondents with data in this block: **9**
- Aggregate mean across block: **4.51 / 5.00**

| Item                                                                         |   n | Mean | Strongly agree | Agree / Somewhat agree | Neither / Disagree |
| ---------------------------------------------------------------------------- | --: | ---: | -------------: | ---------------------: | -----------------: |
| The location for scheduling a quiz was easy to identify.                     |   9 | 4.33 |              7 |                      0 |                  2 |
| The scheduling process was easy to understand without external instructions. |   9 | 4.78 |              7 |                      2 |                  0 |
| The interface guided me naturally through the scheduling process.            |   9 | 4.67 |              8 |                      0 |                  1 |
| The system provided sufficient feedback when I scheduled or moved a quiz.    |   9 | 4.56 |              6 |                      2 |                  1 |
| Clear feedback was provided when quizzes were scheduled, moved, or updated.  |   9 | 4.67 |              6 |                      3 |                  0 |
| It was easy to adjust or correct a scheduling mistake.                       |   9 | 4.33 |              5 |                      3 |                  1 |
| Rescheduling a quiz was straightforward.                                     |   9 | 4.11 |              3 |                      5 |                  1 |
| I felt confident that my changes to the schedule were saved correctly.       |   9 | 4.67 |              7 |                      1 |                  1 |

![Scheduling and rescheduling item means](figures/generated-figures/annex-g-scheduling-and-rescheduling-items.svg)

_Figure C.6. Mean scores for the individual scheduling and rescheduling items in the initial user test._

### 4.4 Student Quiz Experience

- Respondents with data in this block: **9**
- Aggregate mean across block: **4.81 / 5.00**

| Item                                                                                                           |   n | Mean | Strongly agree | Agree / Somewhat agree | Neither / Disagree |
| -------------------------------------------------------------------------------------------------------------- | --: | ---: | -------------: | ---------------------: | -----------------: |
| The mobile application could be used independently by students after minimal initial exposure.                 |   9 | 4.89 |              8 |                      1 |                  0 |
| The application design is well-suited for short revision sessions.                                             |   9 | 5.00 |              9 |                      0 |                  0 |
| The quiz experience is engaging for students.                                                                  |   9 | 4.22 |              3 |                      5 |                  1 |
| Time pressure during quizzes (where applicable) was perceived as appropriate rather than stressful.            |   9 | 4.67 |              6 |                      3 |                  0 |
| A mobile application increases student accessibility to the platform, compared to a web-based platform.        |   9 | 5.00 |              9 |                      0 |                  0 |
| Gamification features (leaderboards, scores, rewards, avatar customization) would increase student engagement. |   9 | 5.00 |              9 |                      0 |                  0 |
| The mobile application feels well-suited for brief, on-the-go use.                                             |   9 | 4.89 |              8 |                      1 |                  0 |

![Student quiz experience item means](figures/generated-figures/annex-g-student-quiz-experience-items.svg)

_Figure C.7. Mean scores for the individual student quiz experience items in the initial user test._

### 4.5 Overall Platform Value

- Respondents with data in this block: **9**
- Aggregate mean across block: **4.15 / 5.00**

| Item                                                                               |   n | Mean | Strongly agree | Agree / Somewhat agree | Neither / Disagree |
| ---------------------------------------------------------------------------------- | --: | ---: | -------------: | ---------------------: | -----------------: |
| The platform feels practical for day-to-day classroom use.                         |   9 | 4.44 |              4 |                      5 |                  0 |
| The platform integrates well into my regular teaching routine.                     |   9 | 4.56 |              5 |                      4 |                  0 |
| Using this platform would save me time compared to my current revision practices.  |   9 | 3.89 |              1 |                      6 |                  2 |
| Managing revision through this platform would feel more efficient.                 |   9 | 4.22 |              3 |                      5 |                  1 |
| The platform reduces the administrative burden of organising revision activities.  |   9 | 4.11 |              3 |                      4 |                  2 |
| The platform provides clear value beyond my current tools.                         |   9 | 4.00 |              2 |                      5 |                  2 |
| The platform fits within typical school constraints (time, resources).             |   9 | 4.00 |              1 |                      7 |                  1 |
| The platform encourages students to engage in independent, self-directed learning. |   9 | 4.00 |              1 |                      7 |                  1 |

![Overall platform value item means](figures/generated-figures/annex-g-overall-platform-value-items.svg)

_Figure C.8. Mean scores for the individual overall platform value items in the initial user test._

### 4.6 AI Attitudes

- Respondents with data in this block: **9**
- Aggregate mean across block: **4.80 / 5.00**

| Item                                                                                       |   n | Mean | Strongly agree | Agree / Somewhat agree | Neither / Disagree |
| ------------------------------------------------------------------------------------------ | --: | ---: | -------------: | ---------------------: | -----------------: |
| Use of AI-generated quizzes would reduce the effort required to create revision questions. |   9 | 4.78 |              7 |                      2 |                  0 |
| AI-generated questions would be considered trustworthy after review.                       |   9 | 4.56 |              5 |                      4 |                  0 |
| Use of AI-generated quizzes for revision would feel comfortable and acceptable.            |   9 | 4.67 |              6 |                      3 |                  0 |
| Control over topic coverage should be available when using AI-generated quizzes.           |   9 | 5.00 |              9 |                      0 |                  0 |
| AI-generated quizzes should align closely with the syllabus.                               |   9 | 5.00 |              9 |                      0 |                  0 |

![AI attitudes item means](figures/generated-figures/annex-g-ai-attitudes-items.svg)

_Figure C.9. Mean scores for the individual AI-attitude items in the initial user test._

## 5. Open-Ended Responses

### 5.1 Class Creation

**What parts of the class creation process felt unclear or unintuitive (if any)?**

- "nil"
- "It may be useful to be able to regenerate their passwords/usernames or have a downloadable file even after the initial dissemination, in the event students forget their passwords."
- "Some teachers might not understand what it means to save or distribute the credentials and will lose them after leaving the page. A more direct instruction to download the CSV, or making downloading the CSV a necessary step before going to the next page might be safer."
- "Maybe a dropdown list for the level will be more user friendly."
- "None, but the interface is not that mobile friendly."
- "The warning about the \"credentials won't be shown again\". Users may still make such mistakes by not saving them despite the red font warning. Is there a function/mechanism put in place for them to still retrieve students' login credentials if such case really happens?"
- "I think it was easy to follow since it only involves 3 steps."
- "Do you allow teachers to create a small group teaching? So can we bypass uploading of CSV file? We want to have the option to key in students’ names directly into the system. For an e.g. i want to assign only to a differentiated group e.g. 5 students. We hope to key in the 5 names directly and form a group. A teaching class is not necessarily a full class of 35-40 students. Sometimes we just need to assign a small group to review and review certain concepts."

### 5.2 Quiz Creation

**What parts of the quiz creation process felt unclear or unintuitive (if any)?**

- "Basic Quiz. \"Context\" option. I missed that out. Could we change that to a \"Multi-Part Question\" instead? So teachers can typed the context in the main question page and then we can add in part a), b), c) etc."
- "The button to add the next question could be more obvious for the basic quiz."
- "I am thinking the context in basic quiz be brought to the front tab instead of the last, as it usually sets the stem of the questions"
- "For Basic, it took me a while to spot that there was an option for different item types, so I was wondering where to type the context question. But it's a first-time user issue, as once I spotted, it was intuitive for the rest of the questions."
- "For MCQs, I couldn't set the next question without having to click the additional item on the left. I didn't I have to add the items to 3 before setting the 3 questions."
- "-"
- "1. Under \"Basic\" quiz type, when creating a new question by clicking \"+\", a new question card appears at the same spot and covered the previously created question. This transition does not visibly cue the user the end of the previous action and the beginning of a new action. A more intuitive transition could be, for example, the previous question retracts into a smaller card and moves up, then the new question card appears below when the page also moves to help user focus on the new question card. 2. Timer: when the timer toggle is off, the wording \"No limit\" is displayed on the right hand side of the toggle, which might mislead the user to think this toggle functions to turn on the \"No limit\" setting. But user will only realise the toggle is just to turn on or off the timer after clicking it and the wording changes to \"On\". So instead of put the wording \"No limit\" there, I feel just put words \"On\" and \"Off\" will be more intuitive, because the toggle shows grey colour when it is off, and green colour when turned on, which matches the common product design practice. If really need to add \"No limit\", maybe can put as \"Off (no limit)\"? 3. When creating \"subject\" and \"topic\", for first time users, there is no subject or topic in the drop down list. The option to \"Select A Subject\" or \"Select A Topic\" might be misleading the user to think by clicking the box, which looks more like a button than the \"Add new...\" because of the shape and colour that's one shade darker than the background drop down menu, they can choose from a list of subjects and topics. However, after creating the first subject/topic, then I realised the subject/topic label I just created will be added below for me to choose from next time when I create a quiz. Perhaps can consider not showing the \"Select A Subject\" or \"Select A Topic\" wording when there is no subject/topic created yet. So that user will see only one fuction to \"Add new...+\" (can consider to make the \"Add new...+\" to look more like a button too). The \"Select A Subject\" or \"Select A Topic\" can be shown after the first subject/topic has been created by the user as it will make more sense after there is something for users to choose from."

**What features would make quiz creation more efficient?**

- "If the add question button stays on top even as questions are being added."
- "See above."
- "For the crossword quiz, it can be placed at the bottom right corner so that users do not need to scroll up all the way to add a new word."
- "By uploading a quiz in word document or pdf file and it automatically churns out"
- "Just a cosmetic issue... I was uncomfortable with the size and position of the box for the question text. It felt too small and the position of it on the left of the options felt 'weird'. I think most teachers are used to seeing the question being above the options."
- "If can do away with that and just keep the \"next question\" button when needing to create more questions would make it easier."
- "It will be great if there’s an AI function to generate similar questions while keeping the question stem identical (extra practice for math)"
- "AI generated questions and answers. Users could just enter subject and topic as prompt for the AI to generate questions then user can edit based on that."
- "You can provide question banks for the three main types of learning progress e.g. Low progress, Middle progress and High progress."

**Are there any types of revision activities you commonly use that are not well supported by the current quiz types?**

- "-"
- "The option for students to submit a drawing. Teachers can upload a background template and students can annotate or draw on it during submission."
- "Flash card, True / False, any spot the difference games :X ?"
- "Not so much the revision activity, but the feedback that can be provided to the student after they attempt the questions."
- "The type with check boxes. Check all boxes that are correct."
- "Prompts/hints given to students when they attempted the question incorrectly for them to reattempt the questions"
- "Not any at the moment."
- "Currently, we are using SLS and they can assign quizzes to a small group of students, not necessarily a full class"

### 5.3 Scheduling and Rescheduling

**What parts of the scheduling process felt unclear or unintuitive (if any)?**

- "Tendency to go back to the quiz and click on the edit button."
- "nil"
- "There was no button to click on to reschedule. It took a few tries to figure out that it was a right-click on the calendar. It would be useful to have an option to see all the quizzes assigned and edit the schedule from there."
- "I did not watch the video but I trial and error and did a right click to edit the schedule. I got it by chance. (screen interface) I need to decrease the screen size to 90%, then I am able to click the assign tab."
- "Again, first-time user issue. Didn't see the instructions to right-click to edit at first. Also, when scheduling the quiz, the pop-out with the editing selections is cut off when the page zoom was at 100%. I could only see the 'schedule' button at the bottom when zoomed out to 80%. Not all teachers may be savvy enough to know how to zoom out. Could that pop-out have a scroll so that the bottom can be seen regardless of zoom setting?"
- "I wasn't sure the scheduling of quzzies is done under \"Quzzies\" or \"class\". After changing the dates and other details of the quzzies, I wasn't sure how to get out of it and go back to the page."
- "I couldn’t do it via phone. The interface doesn’t quite support the use of Iphone"
- "Even though there is a prompt on the hovering card saying \"right click to edit details\", it took me some time to figure out I need to right click the quiz \"bar\" to edit the details. Perhaps the prompt can indicate more specifically where to right click?"

**Are there any real classroom or school constraints that might make scheduling quizzes difficult using this system?**

- "nil"
- "nil"
- "What would happen if the student already attempted the quiz 3 times before I edit to 2 attempts only? Would the results still be saved?"
- "-"
- "Nil"
- "I couldn’t find the reschedule button on the right"
- "Not any."

### 5.4 Student Quiz Experience

**What parts of the student quiz experience might confuse a primary school student?**

- "nil"
- "a"
- "nil"
- "For the context item, the students may prefer having a pop-up to refer to the context while completing the following questions, instead of having to click back."
- "-"
- "None I can think of at the moment"
- "I think it is user friendly enough, even for primary school students."
- "Will there be notifications for them to access the platform when teachers schedule a quiz?"
- "Not any"

**What factors might prevent students from using this application regularly in practice?**

- "parental permission to use device"
- "a"
- "To make the students' interface more kids friendly? add in more colours, font type can be more kids friendly, don't keep it to black"
- "Gamification can be included or more animation for getting the answers correct or wrong."
- "May provide Interactive goal/game features eg. one group competing to win another group to solve questions to meet a goal ..."
- "Not sure how much data this might use... there might be parents who are on a limited budget and may not like their children constantly using up the data."
- "All words and very few diagrams."
- "Accessibility to mobile devices, motivation to learn via this platform"
- "No access to phones/devices if parents do not allow."

### 5.5 Other Feedback

**Any other feedback?**

- "nil"
- "Perhaps can have an option for teachers to upload the questions by uploading pdf/csv files? So teachers don't have to type in questions one by one but upload the questions all at once."
- "It is a straightforward platform for teachers to use for daily revision, but there are many platforms that provide the same experience. However, I do like that the interface is suitable on a mobile device so even if the students do not have access to computers at home, they can simply use a mobile phone to complete the quizzes. Thank you for thinking of teachers when you created this platform!"
- "Add in the element of fun and interactive, eg Blooket game features"
- "Nil"
- "Nil, thanks for making the interface user friendly and lag-free"
- "Not any"
