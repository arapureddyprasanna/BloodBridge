from django.urls import reverse

from accounts.models import (
    User,
    VerificationApplication,
    VerificationDocument,
)
from communities.models import DonorCommunityApplication
from test_utils import FirebaseAPITestCase


class DonorOnboardingStatusTests(FirebaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.donor = self.make_user(
            account_status=User.AccountStatus.PENDING,
        )
        self.community_admin = self.make_user(
            role=User.Role.COMMUNITY_ADMIN,
        )
        self.community = self.community_admin.community
        self.url = reverse("donor-onboarding-status")

    def get_onboarding_status(self):
        return self.client.get(
            self.url,
            **self.auth_headers(self.donor),
        )

    def create_community_application(self, status):
        return DonorCommunityApplication.objects.create(
            donor=self.donor,
            community=self.community,
            status=status,
        )

    def add_required_documents(self, status):
        application = self.donor.verification_application
        for document_type in (
            "donor_identity",
            "age_verification",
            "donor_declaration",
        ):
            VerificationDocument.objects.create(
                application=application,
                document_type=document_type,
                file=self.png_upload(f"{document_type}.png"),
                status=status,
            )
        return application

    def test_no_community_application_routes_to_selection(self):
        response = self.get_onboarding_status()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["next_step"], "community_selection")
        self.assertFalse(response.data["dashboard_access"])

    def test_pending_community_application_without_documents_routes_to_documents(self):
        self.create_community_application(
            DonorCommunityApplication.Status.PENDING,
        )

        response = self.get_onboarding_status()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["next_step"], "documents")
        self.assertFalse(response.data["required_documents_uploaded"])
        self.assertFalse(response.data["dashboard_access"])

    def test_uploaded_but_unsubmitted_documents_stay_on_documents(self):
        self.create_community_application(
            DonorCommunityApplication.Status.PENDING,
        )
        self.add_required_documents(
            VerificationDocument.Status.PENDING,
        )

        response = self.get_onboarding_status()

        self.assertEqual(response.data["next_step"], "documents")
        self.assertTrue(response.data["required_documents_uploaded"])
        self.assertFalse(response.data["dashboard_access"])

    def test_submitted_required_documents_route_to_community_review(self):
        self.create_community_application(
            DonorCommunityApplication.Status.PENDING,
        )
        verification = self.add_required_documents(
            VerificationDocument.Status.PENDING,
        )
        verification.status = VerificationApplication.Status.SUBMITTED
        verification.save(update_fields=["status"])

        response = self.get_onboarding_status()

        self.assertEqual(response.data["next_step"], "community_review")
        self.assertFalse(response.data["dashboard_access"])

    def test_rejected_required_document_routes_back_to_documents(self):
        self.create_community_application(
            DonorCommunityApplication.Status.PENDING,
        )
        verification = self.add_required_documents(
            VerificationDocument.Status.PENDING,
        )
        rejected_document = verification.documents.get(
            document_type="donor_identity",
        )
        rejected_document.status = VerificationDocument.Status.REJECTED
        rejected_document.save(update_fields=["status"])
        verification.status = VerificationApplication.Status.SUBMITTED
        verification.save(update_fields=["status"])

        response = self.get_onboarding_status()

        self.assertEqual(response.data["next_step"], "documents")
        self.assertTrue(response.data["has_rejected_documents"])
        self.assertFalse(response.data["dashboard_access"])

    def test_rejected_community_application_routes_to_selection(self):
        self.create_community_application(
            DonorCommunityApplication.Status.REJECTED,
        )
        verification = self.add_required_documents(
            VerificationDocument.Status.PENDING,
        )
        verification.status = VerificationApplication.Status.SUBMITTED
        verification.save(update_fields=["status"])

        response = self.get_onboarding_status()

        self.assertEqual(response.data["next_step"], "community_selection")
        self.assertFalse(response.data["community_selected"])
        self.assertFalse(response.data["dashboard_access"])

    def test_accepted_community_without_active_approval_is_pending(self):
        self.create_community_application(
            DonorCommunityApplication.Status.ACCEPTED,
        )
        verification = self.add_required_documents(
            VerificationDocument.Status.VERIFIED,
        )
        verification.status = VerificationApplication.Status.SUBMITTED
        verification.save(update_fields=["status"])

        response = self.get_onboarding_status()

        self.assertEqual(response.data["next_step"], "pending")
        self.assertFalse(response.data["dashboard_access"])

    def test_active_accepted_donor_with_verified_documents_gets_dashboard(self):
        self.create_community_application(
            DonorCommunityApplication.Status.ACCEPTED,
        )
        verification = self.add_required_documents(
            VerificationDocument.Status.VERIFIED,
        )
        verification.status = VerificationApplication.Status.SUBMITTED
        verification.save(update_fields=["status"])
        self.donor.account_status = User.AccountStatus.ACTIVE
        self.donor.save(update_fields=["account_status"])

        response = self.get_onboarding_status()

        self.assertEqual(response.data["next_step"], "dashboard")
        self.assertTrue(response.data["dashboard_access"])
        self.assertTrue(response.data["required_documents_verified"])